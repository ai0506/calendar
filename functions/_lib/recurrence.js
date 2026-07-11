// Recurring event validation and date-only rule calculation.
//
// Date progression intentionally operates on YYYY-MM-DD components. It never
// advances a full timestamp by milliseconds, so the stored time and offset can
// be preserved without depending on the runtime's local timezone.

export const MAX_INSTANCES = 366;
export const MAX_CANDIDATES = 10_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FREQUENCIES = new Set(["daily", "weekly", "monthly", "yearly"]);

export function isDateOnly(value) {
  return typeof value === "string" && DATE_RE.test(value) && isValidDateKey(value);
}

export function isDateTime(value) {
  return typeof value === "string" && DATETIME_RE.test(value) && isValidDateKey(value.slice(0, 10));
}

export function isValidDateKey(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function dateParts(value) {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

function formatDate(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function compareDate(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function dayOfWeek(date) {
  // Sakamoto's Gregorian weekday algorithm: Sunday = 0.
  const { year: originalYear, month, day } = dateParts(date);
  let year = originalYear;
  const table = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  if (month < 3) year -= 1;
  return (year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400) + table[month - 1] + day) % 7;
}

function addDays(date, amount) {
  let { year, month, day } = dateParts(date);
  let remaining = amount;
  const direction = remaining >= 0 ? 1 : -1;
  remaining = Math.abs(remaining);

  while (remaining > 0) {
    day += direction;
    if (direction > 0 && day > daysInMonth(year, month)) {
      day = 1;
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    } else if (direction < 0 && day < 1) {
      month -= 1;
      if (month < 1) { month = 12; year -= 1; }
      day = daysInMonth(year, month);
    }
    remaining -= 1;
  }
  return formatDate(year, month, day);
}

export function shiftDate(date, amount) {
  return addDays(date, amount);
}

export function dateDelta(startDate, endDate) {
  return parseDateDelta(startDate, endDate);
}

function addMonths(date, amount) {
  const { year, month } = dateParts(date);
  const zeroBased = year * 12 + (month - 1) + amount;
  const nextYear = Math.floor(zeroBased / 12);
  const nextMonth = (zeroBased % 12) + 1;
  return { year: nextYear, month: nextMonth };
}

function appendDateSuffix(date, suffix) {
  return `${date}${suffix || ""}`;
}

function parseDateDelta(startDate, endDate) {
  if (!endDate) return 0;
  let current = startDate;
  let delta = 0;
  while (current !== endDate && delta < MAX_CANDIDATES) {
    if (compareDate(current, endDate) < 0) {
      current = addDays(current, 1);
      delta += 1;
    } else {
      current = addDays(current, -1);
      delta -= 1;
    }
  }
  if (current !== endDate) throw new Error("event date span is too large");
  return delta;
}

function suffixOf(value) {
  return value.length > 10 ? value.slice(10) : "";
}

function candidateWithinEnd(candidate, endDate) {
  return !endDate || compareDate(candidate, endDate) <= 0;
}

function addInstance(instances, startDate, endDate, startSuffix, endSuffix, endDelta) {
  const instanceEndDate = endDate ? addDays(startDate, endDelta) : null;
  instances.push({
    start_time: appendDateSuffix(startDate, startSuffix),
    end_time: endDate ? appendDateSuffix(instanceEndDate, endSuffix) : null,
  });
}

export function validateRecurringRequest(body) {
  if (!body || typeof body !== "object") return "Request body must be a JSON object";
  if (!UUID_RE.test(body.idempotency_key || "")) return "idempotency_key must be a UUID";
  if (!FREQUENCIES.has(body.frequency)) return "frequency must be daily, weekly, monthly, or yearly";
  if (body.interval !== undefined && body.interval !== 1) return "interval must be 1 in v1";
  if (!isValidDateKey(body.start_date)) return "start_date must be a valid YYYY-MM-DD date";
  if (!body.start_time || !isDateOnly(body.start_time) && !isDateTime(body.start_time)) {
    return "start_time must be a valid date or ISO datetime";
  }
  if (body.start_time.slice(0, 10) !== body.start_date) return "start_date must match start_time";

  const startDateOnly = isDateOnly(body.start_time);
  const endTime = body.end_time;
  if (startDateOnly && (body.all_day !== true && body.all_day !== 1 && body.all_day !== "1")) return "date-only start_time requires all_day=true";
  if (endTime !== undefined && endTime !== null && endTime !== "") {
    const sameShape = startDateOnly ? isDateOnly(endTime) : isDateTime(endTime);
    if (!sameShape) return "start_time and end_time must use the same date format";
    if (compareDate(endTime.slice(0, 10), body.start_date) < 0) return "end_time must not be before start_time";
    if (!startDateOnly && Date.parse(endTime) <= Date.parse(body.start_time)) return "end_time must be after start_time";
    if (startDateOnly && compareDate(endTime, body.start_time) < 0) return "end_time must not be before start_time";
  }

  if (body.end_date !== undefined && body.end_date !== null && body.end_date !== "" && !isValidDateKey(body.end_date)) {
    return "end_date must be a valid YYYY-MM-DD date";
  }
  if (body.end_date && compareDate(body.end_date, body.start_date) < 0) return "end_date cannot be before start_date";
  if (body.occurrence_count !== undefined && body.occurrence_count !== null &&
      (!Number.isInteger(body.occurrence_count) || body.occurrence_count <= 0)) {
    return "occurrence_count must be a positive integer";
  }
  if (body.occurrence_count > MAX_INSTANCES) return `occurrence_count cannot exceed ${MAX_INSTANCES}`;
  if (!body.end_date && !body.occurrence_count) return "an end_date or occurrence_count is required";

  if (body.frequency === "weekly") {
    if (!Array.isArray(body.weekdays) || body.weekdays.length === 0) return "weekdays must contain at least one weekday";
    const unique = new Set(body.weekdays);
    if (unique.size !== body.weekdays.length || body.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      return "weekdays must contain unique values from 0 to 6";
    }
  }

  if (body.frequency === "monthly") {
    const monthlyDay = body.monthly_day;
    const startDay = Number(body.start_date.slice(8, 10));
    if (!Number.isInteger(monthlyDay) || monthlyDay !== startDay) return "monthly_day must match the start date";
    if (body.monthly_mode !== "day-of-month") return "monthly_mode must be day-of-month in v1";
  }

  return null;
}

export function generateInstances(body) {
  const startDate = body.start_date;
  const endDate = body.end_date || null;
  const startSuffix = suffixOf(body.start_time);
  const endTime = body.end_time || null;
  const endStartDate = endTime ? endTime.slice(0, 10) : null;
  const endDelta = endTime ? parseDateDelta(startDate, endStartDate) : 0;
  const endSuffix = suffixOf(endTime || "");
  const instances = [];
  let candidates = 0;
  let cursor = startDate;

  const accept = (candidate, isEligible = true) => {
    candidates += 1;
    if (candidates > MAX_CANDIDATES) throw new Error("recurrence calculation exceeded candidate limit");
    if (!isEligible || !candidateWithinEnd(candidate, endDate)) return false;
    addInstance(instances, candidate, endTime, startSuffix, endSuffix, endDelta);
    if (instances.length > MAX_INSTANCES) throw new Error(`recurrence produces more than ${MAX_INSTANCES} events`);
    return Boolean(body.occurrence_count && instances.length >= body.occurrence_count);
  };

  if (body.frequency === "daily") {
    while (true) {
      if (accept(cursor)) break;
      if ((endDate && cursor === endDate) || (body.occurrence_count && instances.length >= body.occurrence_count)) break;
      cursor = addDays(cursor, 1);
    }
  } else if (body.frequency === "weekly") {
    const weekdays = new Set(body.weekdays);
    while (true) {
      const done = accept(cursor, weekdays.has(dayOfWeek(cursor)));
      if (done) break;
      if ((endDate && cursor === endDate) || (body.occurrence_count && instances.length >= body.occurrence_count)) break;
      cursor = addDays(cursor, 1);
    }
  } else if (body.frequency === "monthly") {
    const start = dateParts(startDate);
    let monthOffset = 0;
    while (true) {
      const { year, month } = addMonths(startDate, monthOffset);
      const valid = body.monthly_day <= daysInMonth(year, month);
      const candidate = valid ? formatDate(year, month, body.monthly_day) : null;
      const done = accept(candidate || formatDate(year, month, 1), valid && compareDate(candidate, startDate) >= 0);
      if (done) break;
      if ((endDate && candidate && compareDate(candidate, endDate) >= 0) || (body.occurrence_count && instances.length >= body.occurrence_count)) break;
      if (endDate && !candidate && compareDate(formatDate(year, month, daysInMonth(year, month)), endDate) >= 0) break;
      monthOffset += 1;
    }
  } else {
    const start = dateParts(startDate);
    let yearOffset = 0;
    while (true) {
      const year = start.year + yearOffset;
      const valid = start.day <= daysInMonth(year, start.month);
      const candidate = valid ? formatDate(year, start.month, start.day) : null;
      const done = accept(candidate || formatDate(year, start.month, 1), valid && compareDate(candidate, startDate) >= 0);
      if (done) break;
      if ((endDate && candidate && compareDate(candidate, endDate) >= 0) || (body.occurrence_count && instances.length >= body.occurrence_count)) break;
      if (endDate && !candidate && compareDate(formatDate(year, start.month, daysInMonth(year, start.month)), endDate) >= 0) break;
      yearOffset += 1;
    }
  }

  if (instances.length === 0) throw new Error("recurrence rule produced no instances");
  return instances;
}

export function rowToSeries(row) {
  if (!row) return row;
  let weekdays = null;
  if (row.weekdays) {
    try { weekdays = JSON.parse(row.weekdays); } catch { weekdays = null; }
  }
  return { ...row, all_day: row.all_day === 1, weekdays };
}

/** Convert a stored event_series row into the request shape used by the
 * recurrence validator/calculator. The caller supplies a fresh validation
 * idempotency key because stored series keys identify the series creation,
 * not a later mutation operation. */
export function seriesRowToRequest(row, idempotencyKey = crypto.randomUUID()) {
  let weekdays = null;
  if (row.weekdays) {
    try { weekdays = JSON.parse(row.weekdays); } catch { weekdays = null; }
  }
  return {
    title: row.title,
    description: row.description,
    start_time: row.start_time,
    end_time: row.end_time,
    all_day: row.all_day === 1,
    category: row.category,
    color: row.color,
    group_title: row.group_title,
    frequency: row.frequency,
    interval: row.interval ?? 1,
    weekdays,
    monthly_mode: row.monthly_mode,
    monthly_day: row.monthly_day,
    start_date: row.start_date,
    end_date: row.end_date,
    occurrence_count: row.occurrence_count,
    idempotency_key: idempotencyKey,
  };
}

/**
 * Merge a partial series update with the stored row.
 * Undefined means "leave the stored value unchanged"; null remains an
 * explicit value so callers can clear optional fields.
 */
export function mergeSeriesPatch(row, patch, fields) {
  const merged = seriesRowToRequest(row);
  for (const field of fields) {
    if (patch?.[field] !== undefined) merged[field] = patch[field];
  }
  return merged;
}

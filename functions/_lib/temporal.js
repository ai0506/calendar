// Shared strict ISO date/date-time validation.
// Date-only progression remains component based; date-times are parsed only
// after all calendar and offset components have passed these checks.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2}))$/;

export function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function daysInMonth(year, month) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isValidDateKey(value) {
  const match = typeof value === "string" ? value.match(DATE_RE) : null;
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 &&
    day >= 1 && day <= daysInMonth(year, month);
}

export function isDateOnly(value) {
  return isValidDateKey(value);
}

export function isValidIsoDateTime(value) {
  const match = typeof value === "string" ? value.match(DATETIME_RE) : null;
  if (!match || !isValidDateKey(`${match[1]}-${match[2]}-${match[3]}`)) return false;

  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  if (hour > 23 || minute > 59 || second > 59) return false;

  if (match[7] !== "Z") {
    const offsetHour = Number(match[8]);
    const offsetMinute = Number(match[9]);
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }

  return Number.isFinite(Date.parse(value));
}

export function isDateTime(value) {
  return isValidIsoDateTime(value);
}

export function isValidDateOrDateTime(value) {
  return isDateOnly(value) || isDateTime(value);
}

export function dateParts(value) {
  return {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };
}

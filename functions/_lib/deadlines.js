import { queryOne } from "./db.js";
import { nowIso, toIntBool } from "./events.js";
import {
  isDateOnly,
  isDateTime,
  isValidDateKey,
  isValidDateOrDateTime,
} from "./temporal.js";

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const DEADLINE_PRIORITIES = new Set(["high", "default", "low"]);
const DEADLINE_FIELDS = [
  "title", "description", "due_time", "all_day", "category", "color", "group_title", "priority",
];

function isPresent(value) {
  return value !== undefined && value !== null;
}

function normalizeNullableText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function normalizeColor(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  return value.trim().toLowerCase() === "default" ? null : value;
}

export function normalizeDeadlineInput(input) {
  const normalized = { ...input };
  if (normalized.all_day !== undefined) normalized.all_day = toIntBool(normalized.all_day);
  if (normalized.color !== undefined) normalized.color = normalizeColor(normalized.color);
  if (normalized.source !== undefined) normalized.source = normalizeNullableText(normalized.source) || "web";
  if (normalized.external_id !== undefined) normalized.external_id = normalizeNullableText(normalized.external_id);
  if (normalized.description !== undefined) normalized.description = normalizeNullableText(normalized.description);
  if (normalized.group_title !== undefined) normalized.group_title = normalizeNullableText(normalized.group_title);
  if (normalized.category !== undefined) normalized.category = normalizeNullableText(normalized.category);
  if (normalized.priority !== undefined && normalized.priority !== null) {
    normalized.priority = String(normalized.priority).trim().toLowerCase();
  }
  return normalized;
}

function validateOptionalString(input, field) {
  if (input[field] !== undefined && input[field] !== null && typeof input[field] !== "string") {
    return `${field} must be a string or null`;
  }
  return null;
}

export function validateDeadlineInput(input, requireCore = true) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "Request body must be a JSON object";
  }
  if (requireCore && (typeof input.title !== "string" || input.title.trim() === "")) {
    return "title is required and must be a non-empty string";
  }
  if (!requireCore && input.title !== undefined && (typeof input.title !== "string" || input.title.trim() === "")) {
    return "title must be a non-empty string";
  }
  if (requireCore && typeof input.due_time !== "string") {
    return "due_time is required";
  }
  if (input.due_time !== undefined && !isValidDateOrDateTime(input.due_time)) {
    return "due_time must be a valid YYYY-MM-DD date or ISO 8601 datetime";
  }

  if (input.all_day !== undefined && ![true, false, 0, 1, "0", "1"].includes(input.all_day)) {
    return "all_day must be a boolean or 0/1";
  }
  const allDay = input.all_day === undefined ? null : toIntBool(input.all_day) === 1;
  if (input.due_time !== undefined && allDay === null && isDateOnly(input.due_time)) {
    return "date-only deadlines require all_day=true";
  }
  if (input.due_time !== undefined && allDay === true && !isDateOnly(input.due_time)) {
    return "all_day deadlines must use YYYY-MM-DD due_time";
  }
  if (input.due_time !== undefined && allDay === false && !isDateTime(input.due_time)) {
    return "timed deadlines must use an ISO 8601 datetime with timezone";
  }

  for (const field of ["description", "category", "group_title", "source", "external_id"]) {
    const message = validateOptionalString(input, field);
    if (message) return message;
  }
  if (typeof input.category === "string" && input.category.trim() === "") {
    return "category must not be empty";
  }
  if (input.color !== undefined && input.color !== null && typeof input.color !== "string") {
    return "color must be a string or null";
  }
  if (typeof input.color === "string" && input.color.trim().toLowerCase() !== "default" && !COLOR_RE.test(input.color.trim())) {
    return "color must be a six-digit hex color, default, or null";
  }
  if (input.priority !== undefined && (typeof input.priority !== "string" || !DEADLINE_PRIORITIES.has(input.priority.trim().toLowerCase()))) {
    return "priority must be high, default, or low";
  }
  return null;
}

function shanghaiDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value).reduce((out, part) => {
    if (part.type !== "literal") out[part.type] = part.value;
    return out;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function isDeadlineOverdue(row, now = new Date()) {
  if (row.completed_at !== null && row.completed_at !== undefined && row.completed_at !== "") return false;
  if (row.all_day === 1 || row.all_day === true) return shanghaiDateKey(now) > row.due_time;
  return Date.now() >= Date.parse(row.due_time);
}

export function deadlineStatus(row, now = new Date()) {
  if (row.deleted_at) return "deleted";
  if (row.completed_at) return "completed";
  return isDeadlineOverdue(row, now) ? "overdue" : "open";
}

export function rowToDeadline(row, now = new Date()) {
  if (!row) return row;
  const status = deadlineStatus(row, now);
  return {
    ...row,
    all_day: row.all_day === 1,
    status: status === "deleted" ? undefined : status,
    is_overdue: status === "overdue",
  };
}

export function parseBooleanParam(value, defaultValue = true) {
  if (value === null || value === undefined || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  return null;
}

export function deadlineDateParam(value) {
  return value === null || value === undefined || value === "" ? null : isValidDateKey(value) ? value : undefined;
}

export function activeDeadline(env, id) {
  return queryOne(env.DB, "SELECT * FROM deadlines WHERE id = ? AND deleted_at IS NULL", [id]);
}

export function deadlineFields() {
  return DEADLINE_FIELDS;
}

export { nowIso };

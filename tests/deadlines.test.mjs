import assert from "node:assert/strict";
import {
  deadlineStatus,
  isDeadlineOverdue,
  normalizeDeadlineInput,
  parseBooleanParam,
  rowToDeadline,
  validateDeadlineInput,
} from "../functions/_lib/deadlines.js";
import { isDateTime, isValidDateKey } from "../functions/_lib/temporal.js";

assert.equal(isValidDateKey("2026-02-29"), false);
assert.equal(isValidDateKey("2028-02-29"), true);
assert.equal(isValidDateKey("2026-13-01"), false);
assert.equal(isDateTime("2026-07-20T12:00:00+08:00"), true);
assert.equal(isDateTime("2026-07-20T25:00:00+08:00"), false);
assert.equal(isDateTime("2026-07-20T12:00:00+99:99"), false);

const allDay = {
  due_time: "2026-07-20",
  all_day: 1,
  completed_at: null,
  deleted_at: null,
};
assert.equal(isDeadlineOverdue(allDay, new Date("2026-07-20T15:59:59Z")), false);
assert.equal(isDeadlineOverdue(allDay, new Date("2026-07-20T16:00:00Z")), true);
assert.equal(deadlineStatus({ ...allDay, completed_at: "2026-07-21T00:00:00.000Z" }), "completed");
assert.equal(rowToDeadline({ ...allDay, completed_at: "2026-07-21T00:00:00.000Z" }).is_overdue, false);

const normalized = normalizeDeadlineInput({
  source: "   ",
  external_id: "   ",
  color: "default",
});
assert.equal(normalized.source, "web");
assert.equal(normalized.external_id, null);
assert.equal(normalized.color, null);

assert.equal(normalizeDeadlineInput({ priority: " HIGH " }).priority, "high");
assert.equal(validateDeadlineInput({ title: "x", due_time: "2026-07-20", all_day: true, priority: "low" }, true), null);
assert.equal(validateDeadlineInput({ title: "x", due_time: "2026-07-20", all_day: true, priority: "urgent" }, true).includes("priority"), true);
assert.equal(validateDeadlineInput({ title: "x", due_time: "2026-07-20", all_day: true, priority: 1 }, true).includes("priority"), true);

assert.equal(validateDeadlineInput({ title: "x", due_time: "2026-02-30", all_day: true }, true).includes("due_time"), true);
assert.equal(validateDeadlineInput({ title: "x", due_time: "2026-07-20T12:00:00+08:00", all_day: false }, true), null);
assert.equal(parseBooleanParam(undefined, true), true);
assert.equal(parseBooleanParam("false", true), false);
assert.equal(parseBooleanParam("1", true), true);
assert.equal(parseBooleanParam("maybe", true), null);

console.log("deadline unit tests passed");

import assert from "node:assert/strict";
import {
  deadlineReminderStatements,
  eventReminderStatements,
  requestedReminders,
  terminalReminderStatus,
} from "../functions/_lib/reminders.js";

function fakeDb() {
  const statements = [];
  return {
    statements,
    prepare(sql) {
      return {
        bind(...values) {
          const entry = { sql, values };
          statements.push(entry);
          return entry;
        },
      };
    },
  };
}

const now = new Date("2026-07-13T00:00:00.000Z");

assert.deepEqual(requestedReminders({}, false), { provided: false, values: null, error: null });
assert.deepEqual(requestedReminders({ reminders: [10, 60] }, false).values, [60, 10]);
assert.match(requestedReminders({ reminders: [60] }, true).error, /all-day/);
assert.match(requestedReminders({ reminders: [60, 60] }, false).error, /duplicate/);

const eventDb = fakeDb();
const eventPlans = eventReminderStatements(eventDb, {
  id: "event-1", start_time: "2026-07-13T10:00:00+08:00", all_day: 0,
}, [60, 10], now);
assert.equal(eventPlans.length, 2);
assert.ok(eventPlans.every((statement) => statement.sql.includes("ON CONFLICT(target_type, target_id, reminder_key) WHERE status = 'pending'")));
assert.deepEqual(eventPlans.map((statement) => statement.values[3]), ["event:60", "event:10"]);

const deadlineDb = fakeDb();
const deadlinePlans = deadlineReminderStatements(deadlineDb, {
  id: "ddl-1", due_time: "2026-07-15T10:00:00+08:00", all_day: 0, priority: "high",
}, now);
assert.deepEqual(deadlinePlans.map((statement) => statement.values[3]), ["deadline:72", "deadline:24", "deadline:2", "deadline:due"]);

const allDayDb = fakeDb();
const allDayPlans = deadlineReminderStatements(allDayDb, {
  id: "ddl-2", due_time: "2026-07-20", all_day: 1, priority: "default",
}, now);
assert.deepEqual(allDayPlans.map((statement) => statement.values[3]), ["deadline:48", "deadline:due_today"]);

const dispatchNow = new Date("2026-07-13T01:00:00.000Z"); // 09:00 Asia/Shanghai
assert.equal(terminalReminderStatus(
  { target_type: "event", reminder_key: "all_day_morning" },
  { all_day: 1, start_time: "2026-07-13T00:00:00+08:00", deleted_at: null }, dispatchNow,
), null, "all-day Event should dispatch at its 09:00 reminder");
assert.equal(terminalReminderStatus(
  { target_type: "event", reminder_key: "event:10" },
  { all_day: 0, start_time: "2026-07-13T00:00:00+08:00", deleted_at: null }, dispatchNow,
), "skipped", "timed Event should not dispatch after start");
assert.equal(terminalReminderStatus(
  { target_type: "deadline", reminder_key: "deadline:due" },
  { all_day: 0, due_time: "2026-07-13T09:00:00+08:00", completed_at: null, deleted_at: null }, dispatchNow,
), null, "deadline:due should dispatch even when the deadline is now overdue");
assert.equal(terminalReminderStatus(
  { target_type: "deadline", reminder_key: "deadline:due" },
  { all_day: 0, due_time: "2026-07-13T09:00:00+08:00", completed_at: "2026-07-13T01:00:00.000Z", deleted_at: null }, dispatchNow,
), "cancelled", "completed deadline reminders should be cancelled");

console.log("reminder unit tests passed");

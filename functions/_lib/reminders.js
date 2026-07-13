import { batch, queryAll, queryOne } from "./db.js";
import { nowIso } from "./events.js";

export const DEFAULT_EVENT_REMINDERS = [60, 10];
export const ALLOWED_EVENT_REMINDERS = new Set([10, 15, 30, 60, 120, 1440]);

function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function toDate(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function dateKey(value) {
  return String(value).slice(0, 10);
}

function addShanghaiDays(key, days) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function shanghaiNine(key) {
  return new Date(`${key}T09:00:00+08:00`);
}

function statusFor(scheduledAt, now) {
  return scheduledAt.getTime() > now.getTime() ? "pending" : "skipped";
}

export function validateEventReminders(value, allDay) {
  if (!Array.isArray(value)) return "reminders must be an array";
  if (allDay && value.length > 0) return "all-day events do not support custom reminders";
  if (value.length > 2) return "reminders can contain at most two values";
  if (!value.every((item) => Number.isInteger(item) && ALLOWED_EVENT_REMINDERS.has(item))) {
    return "reminders must contain supported positive minute values";
  }
  if (new Set(value).size !== value.length) return "reminders must not contain duplicate values";
  return null;
}

export function normalizedReminders(value) {
  return [...value].sort((a, b) => b - a);
}

export function requestedReminders(body, allDay) {
  if (!own(body, "reminders")) return { provided: false, values: null, error: null };
  const error = validateEventReminders(body.reminders, allDay);
  return { provided: true, values: error ? null : normalizedReminders(body.reminders), error };
}

export function configStatement(db, table, idField, id, values, now = nowIso()) {
  const mode = values.length === 0 ? "disabled" : "custom";
  const remindersJson = values.length === 0 ? null : JSON.stringify(values);
  return db.prepare(`INSERT INTO ${table} (${idField}, mode, reminders_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(${idField}) DO UPDATE SET mode = excluded.mode,
      reminders_json = excluded.reminders_json, updated_at = excluded.updated_at`)
    .bind(id, mode, remindersJson, now);
}

export async function effectiveEventReminders(env, eventId, seriesId = null) {
  const table = seriesId ? "event_series_reminder_configs" : "event_reminder_configs";
  const field = seriesId ? "series_id" : "event_id";
  const id = seriesId || eventId;
  const row = await queryOne(env.DB, `SELECT mode, reminders_json FROM ${table} WHERE ${field} = ?`, [id]);
  if (!row) return DEFAULT_EVENT_REMINDERS;
  if (row.mode === "disabled") return [];
  try {
    const parsed = JSON.parse(row.reminders_json || "[]");
    return validateEventReminders(parsed, false) ? DEFAULT_EVENT_REMINDERS : normalizedReminders(parsed);
  } catch {
    return DEFAULT_EVENT_REMINDERS;
  }
}

function reminderStatement(db, targetType, targetId, reminderKey, minutesBefore, scheduledAt, now) {
  const status = statusFor(scheduledAt, now);
  return db.prepare(`INSERT INTO reminders
    (id, target_type, target_id, reminder_key, minutes_before, scheduled_at, status,
     created_at, updated_at, sent_at, cancelled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
    ON CONFLICT(target_type, target_id, reminder_key) WHERE status = 'pending' DO UPDATE SET
      minutes_before = excluded.minutes_before, scheduled_at = excluded.scheduled_at,
      updated_at = excluded.updated_at`)
    .bind(crypto.randomUUID(), targetType, targetId, reminderKey, minutesBefore,
      scheduledAt.toISOString(), status, now.toISOString(), now.toISOString());
}

export function eventReminderStatements(db, event, reminders, now = new Date()) {
  if (reminders.length === 0) return [];
  if (event.all_day === 1 || event.all_day === true) {
    const scheduled = shanghaiNine(dateKey(event.start_time));
    return [reminderStatement(db, "event", event.id, "all_day_morning", null, scheduled, now)];
  }
  const start = toDate(event.start_time);
  if (!start) return [];
  return reminders.map((minutes) => reminderStatement(
    db, "event", event.id, `event:${minutes}`, minutes,
    new Date(start.getTime() - minutes * 60_000), now,
  ));
}

const DEADLINE_MINUTES = {
  high: [72 * 60, 24 * 60, 2 * 60],
  default: [48 * 60, 2 * 60],
  low: [24 * 60],
};

export function deadlineReminderStatements(db, deadline, now = new Date()) {
  if (deadline.all_day === 1 || deadline.all_day === true) {
    const key = dateKey(deadline.due_time);
    const offsets = deadline.priority === "high" ? [3, 1, 0]
      : deadline.priority === "default" ? [2, 0] : [1];
    return offsets.map((days) => {
      const isDueToday = days === 0;
      return reminderStatement(db, "deadline", deadline.id,
        isDueToday ? "deadline:due_today" : `deadline:${days * 24}`,
        null, shanghaiNine(addShanghaiDays(key, -days)), now);
    });
  }
  const due = toDate(deadline.due_time);
  if (!due) return [];
  const minutes = DEADLINE_MINUTES[deadline.priority] || DEADLINE_MINUTES.default;
  const statements = minutes.map((value) => reminderStatement(
    db, "deadline", deadline.id, `deadline:${value / 60}`, value,
    new Date(due.getTime() - value * 60_000), now,
  ));
  statements.push(reminderStatement(db, "deadline", deadline.id, "deadline:due", null, due, now));
  return statements;
}

export function cancelTargetStatement(db, targetType, targetId, now = nowIso()) {
  return db.prepare(`UPDATE reminders SET status = 'cancelled', cancelled_at = ?, updated_at = ?
    WHERE target_type = ? AND target_id = ? AND status = 'pending'`)
    .bind(now, now, targetType, targetId);
}

export function cancelSeriesStatement(db, seriesId, now = nowIso()) {
  return db.prepare(`UPDATE reminders SET status = 'cancelled', cancelled_at = ?, updated_at = ?
    WHERE target_type = 'event' AND status = 'pending' AND target_id IN
      (SELECT id FROM events WHERE series_id = ?)`)
    .bind(now, now, seriesId);
}

export function cancelSeriesFromStatement(db, seriesId, startDate, now = nowIso()) {
  return db.prepare(`UPDATE reminders SET status = 'cancelled', cancelled_at = ?, updated_at = ?
    WHERE target_type = 'event' AND status = 'pending' AND target_id IN
      (SELECT id FROM events WHERE series_id = ? AND substr(original_start_time, 1, 10) >= ?)`)
    .bind(now, now, seriesId, startDate);
}

function remainingMessage(prefix, targetAt, now) {
  const minutes = Math.max(0, Math.ceil((targetAt.getTime() - now.getTime()) / 60_000));
  if (minutes < 60) return `${prefix} in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${prefix} in ${hours} hour${hours === 1 ? "" : "s"}`;
}

async function targetForReminder(env, reminder) {
  if (reminder.target_type === "event") {
    return queryOne(env.DB, "SELECT * FROM events WHERE id = ?", [reminder.target_id]);
  }
  return queryOne(env.DB, "SELECT * FROM deadlines WHERE id = ?", [reminder.target_id]);
}

function notificationFor(reminder, target, now) {
  if (reminder.target_type === "event") {
    if (target.all_day === 1 || target.all_day === true) {
      return { message: "All-day event today", type: "event_all_day" };
    }
    return { message: remainingMessage("Starts", new Date(target.start_time), now), type: reminder.reminder_key.replace(":", "_") };
  }
  if (reminder.reminder_key === "deadline:due_today") return { message: "Due today", type: "deadline_due_today" };
  if (reminder.reminder_key === "deadline:due") return { message: "Due now", type: "deadline_due" };
  return { message: remainingMessage("Due", new Date(target.due_time), now), type: reminder.reminder_key.replace(":", "_") };
}

export function terminalReminderStatus(reminder, target, now = new Date()) {
  if (!target || target.deleted_at) return "cancelled";
  const allDayEvent = target.all_day === 1 || target.all_day === true;
  if (reminder.target_type === "event" && !allDayEvent && Date.parse(target.start_time) <= now.getTime()) {
    return "skipped";
  }
  // overdue is a display state, not a cancellation state: deadline:due must be able to fire at due_time.
  if (reminder.target_type === "deadline" && target.completed_at) return "cancelled";
  return null;
}

export async function dispatchDueReminders(env, now = new Date()) {
  const reminders = await queryAll(env.DB,
    "SELECT * FROM reminders WHERE status = 'pending' AND scheduled_at <= ? ORDER BY scheduled_at ASC LIMIT 100",
    [now.toISOString()]);
  let dispatched = 0;
  for (const reminder of reminders) {
    const target = await targetForReminder(env, reminder);
    const terminal = terminalReminderStatus(reminder, target, now);
    if (terminal) {
      await batch(env.DB, [env.DB.prepare("UPDATE reminders SET status = ?, updated_at = ?, cancelled_at = ? WHERE id = ? AND status = 'pending'")
        .bind(terminal, now.toISOString(), terminal === "cancelled" ? now.toISOString() : null, reminder.id)]);
      continue;
    }
    const note = notificationFor(reminder, target, now);
    await batch(env.DB, [
      env.DB.prepare(`INSERT INTO notifications
        (id, reminder_id, target_type, target_id, title, message, notification_type, created_at, read_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(reminder_id) DO NOTHING`)
        .bind(crypto.randomUUID(), reminder.id, reminder.target_type, reminder.target_id,
          target.title, note.message, note.type, now.toISOString()),
      env.DB.prepare("UPDATE reminders SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
        .bind(now.toISOString(), now.toISOString(), reminder.id),
    ]);
    dispatched++;
  }
  return dispatched;
}

export async function cleanupNotifications(env, now = new Date()) {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60_000).toISOString();
  await env.DB.prepare("DELETE FROM notifications WHERE created_at < ?").bind(cutoff).run();
}

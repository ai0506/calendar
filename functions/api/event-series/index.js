// /api/event-series
//   POST 创建重复事件系列及全部实例

import { queryOne, batch } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import { validateEventInput, nowIso, toIntBool } from "../../_lib/events.js";
import {
  generateInstances,
  validateRecurringRequest,
} from "../../_lib/recurrence.js";
import { insertInstanceStatement, insertSeriesStatement, seriesFromRequest } from "../../_lib/series.js";
import { configStatement, eventReminderStatements, requestedReminders } from "../../_lib/reminders.js";

function eventCount(env, seriesId) {
  return queryOne(
    env.DB,
    "SELECT COUNT(*) AS count FROM events WHERE series_id = ?",
    [seriesId],
  ).then((row) => Number(row?.count || 0));
}

async function idempotentResponse(env, series) {
  return ok({
    series_id: series.id,
    created_count: await eventCount(env, series.id),
  });
}

function isIdempotencyConflict(err) {
  return /idempotency_key|UNIQUE constraint failed/i.test(String(err?.message || err));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return error("validation_error", "Request body must be a JSON object", 400);
  }

  const eventMessage = validateEventInput(body, true);
  if (eventMessage) return error("validation_error", eventMessage, 400);
  const recurrenceMessage = validateRecurringRequest(body);
  if (recurrenceMessage) return error("validation_error", recurrenceMessage, 400);
  const reminderRequest = requestedReminders(body, toIntBool(body.all_day) === 1);
  if (reminderRequest.error) return error("validation_error", reminderRequest.error, 400);

  const existing = await queryOne(
    env.DB,
    "SELECT * FROM event_series WHERE idempotency_key = ?",
    [body.idempotency_key],
  );
  if (existing) return idempotentResponse(env, existing);

  let instances;
  try {
    instances = generateInstances(body);
  } catch (err) {
    return error("validation_error", err.message || "Invalid recurrence rule", 400);
  }

  const seriesId = crypto.randomUUID();
  const now = nowIso();
  const allDay = toIntBool(body.all_day);
  const series = seriesFromRequest({ ...body, all_day: allDay, interval: 1,
    monthly_mode: body.frequency === "monthly" ? "day-of-month" : null },
    seriesId, body.idempotency_key, now);

  const statements = [insertSeriesStatement(env.DB, series)];
  const reminders = reminderRequest.provided ? reminderRequest.values : [60, 10];
  if (reminderRequest.provided) {
    statements.push(configStatement(env.DB, "event_series_reminder_configs", "series_id", seriesId, reminders, now));
  }

  instances.forEach((instance, index) => {
    const eventId = crypto.randomUUID();
    statements.push(insertInstanceStatement(env.DB, series, instance, index, now, eventId));
    statements.push(...eventReminderStatements(env.DB, { id: eventId, start_time: instance.start_time, all_day: series.all_day }, reminders));
  });

  try {
    await batch(env.DB, statements);
  } catch (err) {
    if (isIdempotencyConflict(err)) {
      const raced = await queryOne(
        env.DB,
        "SELECT * FROM event_series WHERE idempotency_key = ?",
        [body.idempotency_key],
      );
      if (raced) return idempotentResponse(env, raced);
    }
    throw err;
  }

  return ok({ series_id: series.id, created_count: instances.length }, 201);
}

// /api/event-series
//   POST 创建重复事件系列及全部实例

import { queryOne, batch } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import { validateEventInput, nowIso, toIntBool } from "../../_lib/events.js";
import {
  generateInstances,
  validateRecurringRequest,
} from "../../_lib/recurrence.js";

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
  const series = {
    id: seriesId,
    idempotency_key: body.idempotency_key,
    title: body.title,
    description: body.description ?? null,
    category: body.category ?? null,
    color: body.color ?? null,
    group_title: body.group_title ?? null,
    all_day: allDay,
    start_time: body.start_time,
    end_time: body.end_time ?? null,
    frequency: body.frequency,
    interval: 1,
    weekdays: body.weekdays ? JSON.stringify(body.weekdays) : null,
    monthly_mode: body.frequency === "monthly" ? "day-of-month" : null,
    monthly_day: body.frequency === "monthly" ? body.monthly_day : null,
    start_date: body.start_date,
    end_date: body.end_date ?? null,
    occurrence_count: body.occurrence_count ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  const statements = [
    env.DB.prepare(`INSERT INTO event_series
      (id, idempotency_key, title, description, category, color, group_title,
       all_day, start_time, end_time, frequency, interval, weekdays, monthly_mode,
       monthly_day, start_date, end_date, occurrence_count, created_at, updated_at, deleted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        series.id, series.idempotency_key, series.title, series.description,
        series.category, series.color, series.group_title, series.all_day,
        series.start_time, series.end_time, series.frequency, series.interval,
        series.weekdays, series.monthly_mode, series.monthly_day, series.start_date,
        series.end_date, series.occurrence_count, series.created_at, series.updated_at,
        series.deleted_at,
      ),
  ];

  instances.forEach((instance, index) => {
    statements.push(
      env.DB.prepare(`INSERT INTO events
        (id, title, description, start_time, end_time, all_day, category, color,
         group_title, source, external_id, series_id, recurrence_index,
         original_start_time, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(), series.title, series.description, instance.start_time,
          instance.end_time, series.all_day, series.category, series.color,
          series.group_title, "series", null, series.id, index, instance.start_time,
          series.created_at, series.updated_at, null,
        ),
    );
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

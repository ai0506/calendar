import { queryAll, queryOne, batch } from "../../../_lib/db.js";
import { ok, error } from "../../../_lib/response.js";
import { isValidIso, nowIso } from "../../../_lib/events.js";
import { generateInstances, seriesRowToRequest } from "../../../_lib/recurrence.js";
import { cancelTargetStatement, effectiveEventReminders, eventReminderStatements } from "../../../_lib/reminders.js";

async function getActiveSeries(env, id) {
  return queryOne(env.DB, "SELECT * FROM event_series WHERE id = ? AND deleted_at IS NULL", [id]);
}

function occurrenceFor(series, originalStartTime) {
  const instances = generateInstances(seriesRowToRequest(series));
  const index = instances.findIndex((instance) => instance.start_time === originalStartTime);
  return index < 0 ? null : { instance: instances[index], index };
}

export async function onRequestGet(context) {
  const { env, params } = context;
  const series = await getActiveSeries(env, params.id);
  if (!series) return error("not_found", "Event series not found", 404);
  const exceptions = await queryAll(
    env.DB,
    "SELECT * FROM event_exceptions WHERE series_id = ? ORDER BY original_start_time ASC",
    [params.id],
  );
  return ok(exceptions);
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const series = await getActiveSeries(env, params.id);
  if (!series) return error("not_found", "Event series not found", 404);

  const body = await request.json().catch(() => null);
  const originalStartTime = body?.original_start_time;
  if (!body || typeof body !== "object" || !isValidIso(originalStartTime)) {
    return error("validation_error", "original_start_time must be a valid ISO 8601 value", 400);
  }

  let occurrence;
  try {
    occurrence = occurrenceFor(series, originalStartTime);
  } catch (err) {
    return error("validation_error", err.message || "Invalid recurrence rule", 400);
  }
  if (!occurrence) {
    return error("not_an_occurrence", "The specified time is not an occurrence of this series", 400);
  }

  const existing = await queryOne(
    env.DB,
    "SELECT * FROM event_exceptions WHERE series_id = ? AND original_start_time = ?",
    [params.id, originalStartTime],
  );
  if (existing) return ok({ ...existing, skipped: true });

  const now = nowIso();
  const activeEvent = await queryOne(env.DB,
    "SELECT id FROM events WHERE series_id = ? AND original_start_time = ? AND deleted_at IS NULL",
    [params.id, originalStartTime]);
  const statements = [
    env.DB.prepare(`INSERT INTO event_exceptions
      (id, series_id, original_start_time, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), params.id, originalStartTime, now, now),
    env.DB.prepare(`UPDATE events
      SET deleted_at = ?, updated_at = ?
      WHERE series_id = ? AND original_start_time = ? AND deleted_at IS NULL`)
      .bind(now, now, params.id, originalStartTime),
  ];
  if (activeEvent) statements.push(cancelTargetStatement(env.DB, "event", activeEvent.id, now));

  try {
    await batch(env.DB, statements);
  } catch (err) {
    if (/UNIQUE constraint failed/i.test(String(err?.message || err))) {
      const raced = await queryOne(
        env.DB,
        "SELECT * FROM event_exceptions WHERE series_id = ? AND original_start_time = ?",
        [params.id, originalStartTime],
      );
      if (raced) return ok({ ...raced, skipped: true });
    }
    throw err;
  }

  const created = await queryOne(
    env.DB,
    "SELECT * FROM event_exceptions WHERE series_id = ? AND original_start_time = ?",
    [params.id, originalStartTime],
  );
  return ok({ ...created, skipped: true }, 201);
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const series = await getActiveSeries(env, params.id);
  if (!series) return error("not_found", "Event series not found", 404);

  const exception = await queryOne(
    env.DB,
    "SELECT * FROM event_exceptions WHERE id = ? AND series_id = ?",
    [params.exceptionId, params.id],
  );
  if (!exception) return error("not_found", "Event exception not found", 404);

  let occurrence;
  try {
    occurrence = occurrenceFor(series, exception.original_start_time);
  } catch (err) {
    return error("validation_error", err.message || "Invalid recurrence rule", 400);
  }
  if (!occurrence) return error("not_an_occurrence", "The exception no longer matches this series", 400);

  const now = nowIso();
  const reminders = await effectiveEventReminders(env, null, params.id);
  const existing = await queryOne(
    env.DB,
    "SELECT * FROM events WHERE series_id = ? AND original_start_time = ? ORDER BY deleted_at IS NULL DESC LIMIT 1",
    [params.id, exception.original_start_time],
  );
  const statements = [
    env.DB.prepare("DELETE FROM event_exceptions WHERE id = ? AND series_id = ?")
      .bind(params.exceptionId, params.id),
  ];

  if (existing) {
    statements.push(
      env.DB.prepare(`UPDATE events SET deleted_at = NULL, updated_at = ?
        WHERE id = ?`).bind(now, existing.id),
    );
    statements.push(...eventReminderStatements(env.DB, {
      id: existing.id, start_time: occurrence.instance.start_time, all_day: series.all_day,
    }, reminders));
  } else {
    const eventId = crypto.randomUUID();
    statements.push(
      env.DB.prepare(`INSERT INTO events
        (id, title, description, start_time, end_time, all_day, category, color,
         group_title, source, external_id, series_id, recurrence_index,
         original_start_time, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          eventId, series.title, series.description,
          occurrence.instance.start_time, occurrence.instance.end_time,
          series.all_day, series.category, series.color, series.group_title,
          "series", null, params.id, occurrence.index,
          occurrence.instance.start_time, now, now, null,
        ),
    );
    statements.push(...eventReminderStatements(env.DB, {
      id: eventId, start_time: occurrence.instance.start_time, all_day: series.all_day,
    }, reminders));
  }

  await batch(env.DB, statements);
  return ok({ id: params.exceptionId, deleted: true, restored: true });
}

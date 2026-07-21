import { queryAll, queryOne, batch } from "../../../_lib/db.js";
import { ok, error } from "../../../_lib/response.js";
import { nowIso } from "../../../_lib/events.js";
import {
  generateInstances,
  dateDelta,
  isValidDateKey,
  seriesRowToRequest,
  shiftDate,
  validateRecurringRequest,
} from "../../../_lib/recurrence.js";
import { insertInstanceStatement, insertSeriesStatement, seriesFromRequest } from "../../../_lib/series.js";
import { getIdempotencyKey, getOperation, hashRequest, isUniqueConflict } from "../../../_lib/operations.js";
import { cancelSeriesFromStatement, effectiveEventReminders, eventReminderStatements } from "../../../_lib/reminders.js";

async function getActiveSeries(env, id) {
  return queryOne(env.DB, "SELECT * FROM event_series WHERE id = ? AND deleted_at IS NULL", [id]);
}

function operationConflict(operation, sourceId, requestHash) {
  return !operation || operation.operation_type !== "series_split" ||
    operation.source_series_id !== sourceId || operation.request_hash !== requestHash;
}

function moveRequestStartDate(body, newStartDate) {
  const oldStartDate = body.start_time.slice(0, 10);
  const startSuffix = body.start_time.slice(10);
  const endSuffix = body.end_time ? body.end_time.slice(10) : "";
  const endDelta = body.end_time ? dateDelta(oldStartDate, body.end_time.slice(0, 10)) : 0;
  return {
    ...body,
    start_date: newStartDate,
    start_time: `${newStartDate}${startSuffix}`,
    end_time: body.end_time ? `${shiftDate(newStartDate, endDelta)}${endSuffix}` : null,
  };
}

async function splitResponse(env, oldSeriesId, newSeriesId) {
  const series = await queryOne(env.DB, "SELECT * FROM event_series WHERE id = ? AND deleted_at IS NULL", [newSeriesId]);
  if (!series) return null;
  const count = await queryOne(
    env.DB,
    "SELECT COUNT(*) AS count FROM events WHERE series_id = ? AND deleted_at IS NULL",
    [newSeriesId],
  );
  return {
    old_series_id: oldSeriesId,
    new_series_id: newSeriesId,
    old_end_date: shiftDate(series.start_date, -1),
    new_start_date: series.start_date,
    created_count: Number(count?.count || 0),
  };
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const key = getIdempotencyKey(request);
  if (!key) return error("validation_error", "Idempotency-Key header must be a UUID", 400);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || !isValidDateKey(body.split_date)) {
    return error("validation_error", "split_date must be a valid YYYY-MM-DD date", 400);
  }
  const requestHash = await hashRequest({ operation_type: "series_split", series_id: params.id, body });
  const existingOperation = await getOperation(env, key);
  if (existingOperation) {
    if (operationConflict(existingOperation, params.id, requestHash)) {
      return error("conflict", "Idempotency-Key was already used for a different operation", 409);
    }
    return ok(await splitResponse(env, params.id, existingOperation.result_series_id));
  }

  const series = await getActiveSeries(env, params.id);
  if (!series) return error("not_found", "Event series not found", 404);
  if (!series.end_date || series.occurrence_count !== null) {
    return error("split_not_supported_for_count_series", "Split requires a series with end_date and no occurrence_count", 400);
  }
  if (body.split_date <= series.start_date || body.split_date >= series.end_date) {
    return error("validation_error", "split_date must be inside the series date range", 400);
  }

  const oldBody = seriesRowToRequest(series);
  oldBody.end_date = shiftDate(body.split_date, -1);
  oldBody.occurrence_count = null;
  oldBody.idempotency_key = crypto.randomUUID();
  const newBody = seriesRowToRequest(series);
  const movedNewBody = moveRequestStartDate(newBody, body.split_date);
  Object.assign(newBody, movedNewBody);
  newBody.end_date = series.end_date;
  newBody.occurrence_count = null;
  newBody.idempotency_key = crypto.randomUUID();
  const oldMessage = validateRecurringRequest(oldBody);
  const newMessage = validateRecurringRequest(newBody);
  if (oldMessage || newMessage) return error("validation_error", oldMessage || newMessage, 400);

  let newInstances;
  try {
    generateInstances(oldBody);
    newInstances = generateInstances(newBody);
  } catch (err) {
    return error("validation_error", err.message || "Invalid split rule", 400);
  }

  const exceptions = await queryAll(
    env.DB,
    "SELECT * FROM event_exceptions WHERE series_id = ? AND substr(original_start_time, 1, 10) >= ?",
    [params.id, body.split_date],
  );
  const migratedExceptions = new Set(exceptions.map((exception) => exception.original_start_time));
  const now = nowIso();
  const newSeriesId = crypto.randomUUID();
  const newSeries = seriesFromRequest(newBody, newSeriesId, crypto.randomUUID(), now);
  const reminders = await effectiveEventReminders(env, null, params.id);
  const reminderConfig = await queryOne(env.DB,
    "SELECT mode, reminders_json FROM event_series_reminder_configs WHERE series_id = ?", [params.id]);
  const statements = [
    env.DB.prepare(`INSERT INTO event_operations
      (idempotency_key, operation_type, source_series_id, result_series_id, request_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(key, "series_split", params.id, newSeriesId, requestHash, now),
    env.DB.prepare("UPDATE event_series SET end_date = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
      .bind(oldBody.end_date, now, params.id),
    env.DB.prepare(`UPDATE events SET deleted_at = ?, updated_at = ?
      WHERE series_id = ? AND substr(original_start_time, 1, 10) >= ? AND deleted_at IS NULL`)
      .bind(now, now, params.id, body.split_date),
    cancelSeriesFromStatement(env.DB, params.id, body.split_date, now),
    env.DB.prepare(`UPDATE event_exceptions SET series_id = ?, updated_at = ?
      WHERE series_id = ? AND substr(original_start_time, 1, 10) >= ?`)
      .bind(newSeriesId, now, params.id, body.split_date),
    insertSeriesStatement(env.DB, newSeries),
    env.DB.prepare(`INSERT INTO event_series_tags (series_id, tag_id, created_at)
      SELECT ?, tag_id, ? FROM event_series_tags WHERE series_id = ?`)
      .bind(newSeriesId, now, params.id),
  ];
  if (reminderConfig) {
    statements.push(env.DB.prepare(`INSERT INTO event_series_reminder_configs
      (series_id, mode, reminders_json, updated_at) VALUES (?, ?, ?, ?)`)
      .bind(newSeriesId, reminderConfig.mode, reminderConfig.reminders_json, now));
  }
  newInstances.forEach((instance, index) => {
    if (!migratedExceptions.has(instance.start_time)) {
      const eventId = crypto.randomUUID();
      statements.push(insertInstanceStatement(env.DB, newSeries, instance, index, now, eventId));
      statements.push(...eventReminderStatements(env.DB, { id: eventId, start_time: instance.start_time, all_day: newSeries.all_day }, reminders));
    }
  });

  try {
    await batch(env.DB, statements);
  } catch (err) {
    if (isUniqueConflict(err)) {
      const raced = await getOperation(env, key);
      if (raced && !operationConflict(raced, params.id, requestHash)) {
        return ok(await splitResponse(env, params.id, raced.result_series_id));
      }
      if (raced) return error("conflict", "Idempotency-Key was already used for a different operation", 409);
    }
    throw err;
  }

  return ok(await splitResponse(env, params.id, newSeriesId), 201);
}

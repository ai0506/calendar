// /api/event-series/:id
//   GET    获取系列规则和未删除实例
//   DELETE 软删除系列和全部实例

import { queryAll, queryOne, batch } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import { rowToEvent, nowIso } from "../../_lib/events.js";
import { validateEventInput, validateEventTemporalOrder } from "../../_lib/events.js";
import { generateInstances, rowToSeries, mergeSeriesPatch, validateRecurringRequest } from "../../_lib/recurrence.js";
import { activeEventCount, insertInstanceStatement, seriesFromRequest } from "../../_lib/series.js";
import { getIdempotencyKey, getOperation, hashRequest, isUniqueConflict } from "../../_lib/operations.js";
import {
  cancelSeriesStatement,
  configStatement,
  effectiveEventReminders,
  eventReminderStatements,
  requestedReminders,
} from "../../_lib/reminders.js";
import { ensureTagIdsExist, replaceTagStatements, tagsForOwner, validateTagIds } from "../../_lib/tags.js";

async function getActiveSeries(env, id) {
  return queryOne(
    env.DB,
    "SELECT * FROM event_series WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
}

export async function onRequestGet(context) {
  const { env, params } = context;
  const series = await getActiveSeries(env, params.id);
  if (!series) return error("not_found", "Event series not found", 404);

  const events = await queryAll(
    env.DB,
    "SELECT * FROM events WHERE series_id = ? AND deleted_at IS NULL ORDER BY start_time ASC",
    [params.id],
  );
  const exceptions = await queryAll(
    env.DB,
    "SELECT * FROM event_exceptions WHERE series_id = ? ORDER BY original_start_time ASC",
    [params.id],
  );
  const tags = await tagsForOwner(env, "event_series_tags", "series_id", params.id);
  return ok({ series: { ...rowToSeries(series), tags }, events: events.map((event) => ({ ...rowToEvent(event), tags })), exceptions });
}

const SERIES_PATCH_FIELDS = [
  "title", "description", "category", "color", "group_title", "all_day",
  "start_time", "end_time", "frequency", "interval", "weekdays",
  "monthly_mode", "monthly_day", "start_date", "end_date", "occurrence_count",
];

async function seriesPatchResponse(env, seriesId) {
  const series = await getActiveSeries(env, seriesId);
  if (!series) return null;
  return {
    series_id: seriesId,
    updated: true,
    created_count: await activeEventCount(env, seriesId),
  };
}

function operationConflict(operation, type, sourceId, requestHash) {
  return !operation || operation.operation_type !== type ||
    operation.source_series_id !== sourceId || operation.request_hash !== requestHash;
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const key = getIdempotencyKey(request);
  if (!key) return error("validation_error", "Idempotency-Key header must be a UUID", 400);

  const series = await getActiveSeries(env, params.id);
  if (!series) return error("not_found", "Event series not found", 404);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return error("validation_error", "Request body must be a JSON object", 400);
  }

  const requestHash = await hashRequest({ operation_type: "series_patch", series_id: params.id, body });
  const existingOperation = await getOperation(env, key);
  if (existingOperation) {
    if (operationConflict(existingOperation, "series_patch", params.id, requestHash)) {
      return error("conflict", "Idempotency-Key was already used for a different operation", 409);
    }
    return ok(await seriesPatchResponse(env, params.id));
  }

  const merged = mergeSeriesPatch(series, body, SERIES_PATCH_FIELDS);
  merged.idempotency_key = crypto.randomUUID();
  const eventMessage = validateEventInput(merged, true);
  if (eventMessage) return error("validation_error", eventMessage, 400);
  const temporalMessage = validateEventTemporalOrder(merged);
  if (temporalMessage) return error("validation_error", temporalMessage, 400);
  const recurrenceMessage = validateRecurringRequest(merged);
  if (recurrenceMessage) return error("validation_error", recurrenceMessage, 400);
  const reminderRequest = requestedReminders(body, merged.all_day === true || merged.all_day === 1);
  if (reminderRequest.error) return error("validation_error", reminderRequest.error, 400);
  const tagMessage = body.tag_ids === undefined ? null : validateTagIds(body.tag_ids);
  if (tagMessage) return error("validation_error", tagMessage, 400);
  if (body.tag_ids !== undefined) {
    const tagExistsMessage = await ensureTagIdsExist(env, body.tag_ids);
    if (tagExistsMessage) return error("validation_error", tagExistsMessage, 400);
  }

  let instances;
  try {
    instances = generateInstances(merged);
  } catch (err) {
    return error("validation_error", err.message || "Invalid recurrence rule", 400);
  }

  const exceptions = await queryAll(
    env.DB,
    "SELECT * FROM event_exceptions WHERE series_id = ?",
    [params.id],
  );
  const occurrenceSet = new Set(instances.map((instance) => instance.start_time));
  const validExceptions = exceptions.filter((exception) => occurrenceSet.has(exception.original_start_time));
  const invalidExceptions = exceptions.filter((exception) => !occurrenceSet.has(exception.original_start_time));
  const now = nowIso();
  const updatedSeries = seriesFromRequest(merged, params.id, series.idempotency_key, now);
  updatedSeries.created_at = series.created_at;
  const reminders = reminderRequest.provided
    ? reminderRequest.values
    : await effectiveEventReminders(env, null, params.id);
  const statements = [
    env.DB.prepare(`INSERT INTO event_operations
      (idempotency_key, operation_type, source_series_id, result_series_id, request_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(key, "series_patch", params.id, null, requestHash, now),
    env.DB.prepare(`UPDATE event_series SET
      title = ?, description = ?, category = ?, color = ?, group_title = ?, all_day = ?,
      start_time = ?, end_time = ?, frequency = ?, interval = ?, weekdays = ?, monthly_mode = ?,
      monthly_day = ?, start_date = ?, end_date = ?, occurrence_count = ?, updated_at = ?
      WHERE id = ? AND deleted_at IS NULL`)
      .bind(
        updatedSeries.title, updatedSeries.description, updatedSeries.category,
        updatedSeries.color, updatedSeries.group_title, updatedSeries.all_day,
        updatedSeries.start_time, updatedSeries.end_time, updatedSeries.frequency,
        updatedSeries.interval, updatedSeries.weekdays, updatedSeries.monthly_mode,
        updatedSeries.monthly_day, updatedSeries.start_date, updatedSeries.end_date,
        updatedSeries.occurrence_count, now, params.id,
      ),
    env.DB.prepare("UPDATE events SET deleted_at = ?, updated_at = ? WHERE series_id = ? AND deleted_at IS NULL")
      .bind(now, now, params.id),
    cancelSeriesStatement(env.DB, params.id, now),
  ];
  if (reminderRequest.provided) {
    statements.push(configStatement(env.DB, "event_series_reminder_configs", "series_id", params.id, reminders, now));
  }
  if (body.tag_ids !== undefined) statements.push(...replaceTagStatements(env.DB, "event_series_tags", "series_id", params.id, body.tag_ids, now));
  invalidExceptions.forEach((exception) => {
    statements.push(env.DB.prepare("DELETE FROM event_exceptions WHERE id = ? AND series_id = ?")
      .bind(exception.id, params.id));
  });
  const validExceptionSet = new Set(validExceptions.map((exception) => exception.original_start_time));
  instances.forEach((instance, index) => {
    if (!validExceptionSet.has(instance.start_time)) {
      const eventId = crypto.randomUUID();
      statements.push(insertInstanceStatement(env.DB, updatedSeries, instance, index, now, eventId));
      statements.push(...eventReminderStatements(env.DB, { id: eventId, start_time: instance.start_time, all_day: updatedSeries.all_day }, reminders));
    }
  });

  try {
    await batch(env.DB, statements);
  } catch (err) {
    if (isUniqueConflict(err)) {
      const raced = await getOperation(env, key);
      if (raced && !operationConflict(raced, "series_patch", params.id, requestHash)) {
        return ok(await seriesPatchResponse(env, params.id));
      }
      if (raced) return error("conflict", "Idempotency-Key was already used for a different operation", 409);
    }
    throw err;
  }

  return ok(await seriesPatchResponse(env, params.id));
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const series = await getActiveSeries(env, params.id);
  if (!series) return error("not_found", "Event series not found", 404);

  const now = nowIso();
  await batch(env.DB, [
    env.DB.prepare(
      "UPDATE event_series SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    ).bind(now, now, params.id),
    env.DB.prepare(
      "UPDATE events SET deleted_at = ?, updated_at = ? WHERE series_id = ? AND deleted_at IS NULL",
    ).bind(now, now, params.id),
    cancelSeriesStatement(env.DB, params.id, now),
  ]);

  return ok({ id: params.id, deleted: true });
}

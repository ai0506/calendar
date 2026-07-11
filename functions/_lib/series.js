import { queryOne } from "./db.js";

export function seriesFromRequest(requestBody, id, idempotencyKey, now) {
  return {
    id,
    idempotency_key: idempotencyKey,
    title: requestBody.title,
    description: requestBody.description ?? null,
    category: requestBody.category ?? null,
    color: requestBody.color ?? null,
    group_title: requestBody.group_title ?? null,
    all_day: requestBody.all_day === true || requestBody.all_day === 1 || requestBody.all_day === "1" ? 1 : 0,
    start_time: requestBody.start_time,
    end_time: requestBody.end_time ?? null,
    frequency: requestBody.frequency,
    interval: requestBody.interval ?? 1,
    weekdays: requestBody.weekdays ? JSON.stringify(requestBody.weekdays) : null,
    monthly_mode: requestBody.monthly_mode ?? null,
    monthly_day: requestBody.monthly_day ?? null,
    start_date: requestBody.start_date,
    end_date: requestBody.end_date ?? null,
    occurrence_count: requestBody.occurrence_count ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}

export function insertSeriesStatement(db, series) {
  return db.prepare(`INSERT INTO event_series
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
    );
}

export function insertInstanceStatement(db, series, instance, index, now = series.created_at) {
  return db.prepare(`INSERT INTO events
    (id, title, description, start_time, end_time, all_day, category, color,
     group_title, source, external_id, series_id, recurrence_index,
     original_start_time, created_at, updated_at, deleted_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(), series.title, series.description, instance.start_time,
      instance.end_time, series.all_day, series.category, series.color,
      series.group_title, "series", null, series.id, index, instance.start_time,
      now, now, null,
    );
}

export function activeEventCount(env, seriesId) {
  return queryOne(
    env.DB,
    "SELECT COUNT(*) AS count FROM events WHERE series_id = ? AND deleted_at IS NULL",
    [seriesId],
  ).then((row) => Number(row?.count || 0));
}

// /api/event-series/:id
//   GET    获取系列规则和未删除实例
//   DELETE 软删除系列和全部实例

import { queryAll, queryOne, batch } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import { rowToEvent, nowIso } from "../../_lib/events.js";
import { rowToSeries } from "../../_lib/recurrence.js";

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
  return ok({ series: rowToSeries(series), events: events.map(rowToEvent) });
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
  ]);

  return ok({ id: params.id, deleted: true });
}

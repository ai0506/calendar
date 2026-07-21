// /api/events
//   GET  列出事件（支持 from / to / category 过滤，默认排除软删除）
//   POST 创建事件（服务器生成 id / created_at / updated_at）

import { queryAll, batch } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import {
  validateEventInput,
  validateEventTemporalOrder,
  rowToEvent,
  nowIso,
  toIntBool,
} from "../../_lib/events.js";
import { configStatement, effectiveEventReminders, eventReminderStatements, requestedReminders } from "../../_lib/reminders.js";
import { attachTagsToEvents, ensureTagIdsExist, replaceTagStatements, tagsForOwner, validateTagIds } from "../../_lib/tags.js";

// GET /api/events?from=&to=&category=
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const category = url.searchParams.get("category");
  const tagIds = url.searchParams.getAll("tag").filter(Boolean);
  if (new Set(tagIds).size !== tagIds.length) return error("validation_error", "tag query parameters must not contain duplicates", 400);

  let sql = "SELECT * FROM events WHERE deleted_at IS NULL";
  const params = [];

  // 供 FullCalendar 月/周/日视图按范围加载
  if (from) {
    sql += " AND start_time >= ?";
    params.push(from);
  }
  if (to) {
    sql += " AND start_time <= ?";
    params.push(to);
  }
  if (category) {
    sql += " AND category = ?";
    params.push(category);
  }
  if (tagIds.length) {
    const placeholders = tagIds.map(() => "?").join(", ");
    sql += ` AND ((series_id IS NULL AND id IN (SELECT event_id FROM event_tags WHERE tag_id IN (${placeholders}) GROUP BY event_id HAVING COUNT(DISTINCT tag_id) = ?)) OR (series_id IS NOT NULL AND series_id IN (SELECT series_id FROM event_series_tags WHERE tag_id IN (${placeholders}) GROUP BY series_id HAVING COUNT(DISTINCT tag_id) = ?)))`;
    params.push(...tagIds, tagIds.length, ...tagIds, tagIds.length);
  }
  const whereSql = sql.replace(/^SELECT \* FROM events WHERE /, "");
  sql += " ORDER BY start_time ASC";

  const rows = await queryAll(env.DB, sql, params);
  const taggedRows = await attachTagsToEvents(env, rows, whereSql, params);
  // The Android client uses the effective configuration to restore local alarms.
  // It is additive for existing web consumers and preserves a disabled [] value.
  const events = await Promise.all(taggedRows.map(async (row) => ({
    ...rowToEvent(row),
    reminders: await effectiveEventReminders(env, row.id, row.series_id || null),
  })));
  return ok(events);
}

// POST /api/events
export async function onRequestPost(context) {
  const { request, env } = context;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return error("validation_error", "Request body must be a JSON object", 400);
  }

  const msg = validateEventInput(body, true);
  if (msg) return error("validation_error", msg, 400);
  const temporalMsg = validateEventTemporalOrder(body);
  if (temporalMsg) return error("validation_error", temporalMsg, 400);
  const reminderRequest = requestedReminders(body, toIntBool(body.all_day) === 1);
  if (reminderRequest.error) return error("validation_error", reminderRequest.error, 400);
  const tagMessage = body.tag_ids === undefined ? null : validateTagIds(body.tag_ids);
  if (tagMessage) return error("validation_error", tagMessage, 400);
  if (body.tag_ids !== undefined) {
    const tagExistsMessage = await ensureTagIdsExist(env, body.tag_ids);
    if (tagExistsMessage) return error("validation_error", tagExistsMessage, 400);
  }

  const id = crypto.randomUUID();
  const now = nowIso();

  const event = {
    id,
    title: body.title,
    description: body.description ?? null,
    start_time: body.start_time, // 原样保留客户端时区偏移
    end_time: body.end_time ?? null,
    all_day: toIntBool(body.all_day),
    category: body.category ?? null,
    color: body.color ?? null,
    group_title: body.group_title ?? null,
    source: body.source ?? "web",
    external_id: body.external_id ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  const statements = [env.DB.prepare(`INSERT INTO events
       (id, title, description, start_time, end_time, all_day, category, color,
        group_title, source, external_id, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      event.id,
      event.title,
      event.description,
      event.start_time,
      event.end_time,
      event.all_day,
      event.category,
      event.color,
      event.group_title,
      event.source,
      event.external_id,
      event.created_at,
      event.updated_at,
      event.deleted_at,
    )];
  const reminders = reminderRequest.provided ? reminderRequest.values : [60, 10];
  if (reminderRequest.provided) {
    statements.push(configStatement(env.DB, "event_reminder_configs", "event_id", id, reminders, now));
  }
  if (body.tag_ids !== undefined) statements.push(...replaceTagStatements(env.DB, "event_tags", "event_id", id, body.tag_ids, now));
  statements.push(...eventReminderStatements(env.DB, event, reminders));
  await batch(env.DB, statements);

  return ok({ ...rowToEvent(event), reminders, tags: await tagsForOwner(env, "event_tags", "event_id", id) }, 201);
}

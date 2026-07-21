// /api/events/:id
//   GET    获取单个事件（排除软删除）
//   PUT    更新事件（刷新 updated_at，不允许改 id）
//   DELETE 软删除（设置 deleted_at，刷新 updated_at）

import { queryOne, batch } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import {
  validateEventInput,
  validateEventTemporalOrder,
  rowToEvent,
  nowIso,
  toIntBool,
} from "../../_lib/events.js";
import {
  cancelTargetStatement,
  configStatement,
  effectiveEventReminders,
  eventReminderStatements,
  requestedReminders,
} from "../../_lib/reminders.js";
import { ensureTagIdsExist, replaceTagStatements, tagsForOwner, validateTagIds } from "../../_lib/tags.js";

// 可被 PUT 更新的字段（id / created_at 不可改）
const UPDATABLE = [
  "title",
  "description",
  "start_time",
  "end_time",
  "all_day",
  "category",
  "color",
  "group_title",
  "source",
  "external_id",
];

async function getActive(env, id) {
  return queryOne(
    env.DB,
    "SELECT * FROM events WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
}

// GET /api/events/:id
export async function onRequestGet(context) {
  const { env, params } = context;
  const row = await getActive(env, params.id);
  if (!row) return error("not_found", "Event not found", 404);
  // Attach the event's effective reminders (minutes-before) so detail views can
  // show them without a second round-trip. All-day events have no configurable reminders.
  const reminders = row.all_day
    ? []
    : await effectiveEventReminders(env, row.id, row.series_id || null);
  const tags = await tagsForOwner(env, row.series_id ? "event_series_tags" : "event_tags", row.series_id ? "series_id" : "event_id", row.series_id || row.id);
  return ok({ ...rowToEvent(row), reminders, tags });
}

// PUT /api/events/:id
export async function onRequestPut(context) {
  const { request, env, params } = context;

  const existing = await getActive(env, params.id);
  if (!existing) return error("not_found", "Event not found", 404);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return error("validation_error", "Request body must be a JSON object", 400);
  }

  if (existing.series_id && Object.prototype.hasOwnProperty.call(body, "reminders")) {
    return error("validation_error", "reminders for a recurring occurrence must be changed through the event series", 400);
  }
  if (existing.series_id && Object.prototype.hasOwnProperty.call(body, "tag_ids")) {
    return error("validation_error", "tags for a recurring occurrence must be changed through the event series", 400);
  }

  const msg = validateEventInput(body, false);
  if (msg) return error("validation_error", msg, 400);

  const temporalMsg = validateEventTemporalOrder({ ...existing, ...body });
  if (temporalMsg) return error("validation_error", temporalMsg, 400);
  const mergedAllDay = body.all_day === undefined ? existing.all_day : toIntBool(body.all_day);
  const reminderRequest = requestedReminders(body, mergedAllDay === 1);
  if (reminderRequest.error) return error("validation_error", reminderRequest.error, 400);
  const tagMessage = body.tag_ids === undefined ? null : validateTagIds(body.tag_ids);
  if (tagMessage) return error("validation_error", tagMessage, 400);
  if (body.tag_ids !== undefined) {
    const tagExistsMessage = await ensureTagIdsExist(env, body.tag_ids);
    if (tagExistsMessage) return error("validation_error", tagExistsMessage, 400);
  }

  // Changing only the category should also follow that category's color.
  // An explicitly supplied color still wins, so custom event colors remain supported.
  if (
    body.category !== undefined &&
    (body.color === undefined || String(body.color).toLowerCase() === "default") &&
    body.category !== existing.category
  ) {
    const category = await queryOne(env.DB, "SELECT color FROM categories WHERE name = ?", [body.category]);
    if (category?.color) body.color = category.color;
  }

  // 仅更新客户端提供的可更新字段
  const sets = [];
  const values = [];
  for (const f of UPDATABLE) {
    if (body[f] === undefined) continue;
    sets.push(`${f} = ?`);
    values.push(f === "all_day" ? toIntBool(body[f]) : body[f]);
  }

  const now = nowIso();
  sets.push("updated_at = ?");
  values.push(now);
  values.push(params.id);

  const updatedForPlan = { ...existing, ...body, all_day: mergedAllDay, id: params.id };
  const needsReplan = body.start_time !== undefined || body.all_day !== undefined || reminderRequest.provided;
  const statements = [env.DB.prepare(`UPDATE events SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`).bind(...values)];
  let reminders = null;
  if (needsReplan) {
    reminders = reminderRequest.provided
      ? reminderRequest.values
      : await effectiveEventReminders(env, params.id, existing.series_id || null);
    statements.push(cancelTargetStatement(env.DB, "event", params.id, now));
    if (reminderRequest.provided) {
      statements.push(configStatement(env.DB, "event_reminder_configs", "event_id", params.id, reminders, now));
    }
    statements.push(...eventReminderStatements(env.DB, updatedForPlan, reminders));
  }
  if (body.tag_ids !== undefined) statements.push(...replaceTagStatements(env.DB, "event_tags", "event_id", params.id, body.tag_ids, now));
  await batch(env.DB, statements);

  const updated = await getActive(env, params.id);
  const tags = await tagsForOwner(env, "event_tags", "event_id", params.id);
  return ok({ ...rowToEvent(updated), ...(reminders ? { reminders } : {}), tags });
}

// DELETE /api/events/:id  —— 软删除
export async function onRequestDelete(context) {
  const { env, params } = context;
  const now = nowIso();
  const existing = await getActive(env, params.id);
  if (!existing) return error("not_found", "Event not found", 404);
  await batch(env.DB, [
    env.DB.prepare("UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL")
      .bind(now, now, params.id),
    cancelTargetStatement(env.DB, "event", params.id, now),
  ]);
  return ok({ id: params.id, deleted: true });
}

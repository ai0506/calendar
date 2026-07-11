// /api/events/:id
//   GET    获取单个事件（排除软删除）
//   PUT    更新事件（刷新 updated_at，不允许改 id）
//   DELETE 软删除（设置 deleted_at，刷新 updated_at）

import { queryOne, run } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import {
  validateEventInput,
  validateEventTemporalOrder,
  rowToEvent,
  nowIso,
  toIntBool,
} from "../../_lib/events.js";

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
  return ok(rowToEvent(row));
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

  const msg = validateEventInput(body, false);
  if (msg) return error("validation_error", msg, 400);

  const temporalMsg = validateEventTemporalOrder({ ...existing, ...body });
  if (temporalMsg) return error("validation_error", temporalMsg, 400);

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

  await run(
    env.DB,
    `UPDATE events SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
    values,
  );

  const updated = await getActive(env, params.id);
  return ok(rowToEvent(updated));
}

// DELETE /api/events/:id  —— 软删除
export async function onRequestDelete(context) {
  const { env, params } = context;
  const now = nowIso();

  const result = await run(
    env.DB,
    "UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    [now, now, params.id],
  );

  if (!result.meta || result.meta.changes === 0) {
    return error("not_found", "Event not found", 404);
  }
  return ok({ id: params.id, deleted: true });
}

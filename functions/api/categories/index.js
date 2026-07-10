// /api/categories
//   GET  列出全部分类（按 sort_order, name 排序）
//   POST 创建新分类（服务器生成 id / created_at）

import { queryAll, run } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import { nowIso } from "../../_lib/events.js";

// GET /api/categories
export async function onRequestGet(context) {
  const { env } = context;
  const rows = await queryAll(
    env.DB,
    "SELECT * FROM categories ORDER BY sort_order ASC, name ASC",
  );
  return ok(rows);
}

// POST /api/categories
export async function onRequestPost(context) {
  const { request, env } = context;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return error("validation_error", "Request body must be a JSON object", 400);
  }

  if (typeof body.name !== "string" || body.name.trim() === "") {
    return error("validation_error", "name is required and must be a non-empty string", 400);
  }
  if (typeof body.color !== "string" || body.color.trim() === "") {
    return error("validation_error", "color is required and must be a non-empty string", 400);
  }
  if (body.sort_order !== undefined && typeof body.sort_order !== "number") {
    return error("validation_error", "sort_order must be a number", 400);
  }

  const category = {
    id: crypto.randomUUID(),
    name: body.name,
    color: body.color,
    sort_order: body.sort_order ?? 0,
    created_at: nowIso(),
  };

  try {
    await run(
      env.DB,
      "INSERT INTO categories (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)",
      [category.id, category.name, category.color, category.sort_order, category.created_at],
    );
  } catch (e) {
    // categories.name 有 UNIQUE 约束
    if (String(e.message || e).toLowerCase().includes("unique")) {
      return error("conflict", "A category with this name already exists", 409);
    }
    throw e;
  }

  return ok(category, 201);
}

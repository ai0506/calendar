// /api/subjects
//   GET  列出 Academics 的子类（默认只返回启用中的，?include_inactive=1 返回全部）
//   POST 新建 Subject（服务器生成 id / 时间戳）

import { queryOne, run } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import { nowIso } from "../../_lib/events.js";
import { listSubjects } from "../../_lib/subjects.js";

const COLOR_RE = /^#[0-9a-f]{6}$/i;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const includeInactive = ["1", "true"].includes((url.searchParams.get("include_inactive") || "").toLowerCase());
  return ok(await listSubjects(env, { includeInactive }));
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return error("validation_error", "Request body must be a JSON object", 400);
  }
  if (typeof body.name !== "string" || body.name.trim() === "") {
    return error("validation_error", "name is required and must be a non-empty string", 400);
  }
  if (typeof body.color !== "string" || !COLOR_RE.test(body.color.trim())) {
    return error("validation_error", "color is required and must be a six-digit hex color", 400);
  }
  if (body.sort_order !== undefined && typeof body.sort_order !== "number") {
    return error("validation_error", "sort_order must be a number", 400);
  }

  // category_id 可省略：目前只有一个 academics 分类，省略时自动挂到它下面。
  const categoryRow = body.category_id
    ? await queryOne(env.DB, "SELECT id, kind FROM categories WHERE id = ?", [body.category_id])
    : await queryOne(env.DB, "SELECT id, kind FROM categories WHERE kind = 'academics' AND archived = 0 ORDER BY sort_order ASC LIMIT 1");
  if (!categoryRow) return error("validation_error", "category_id must reference an existing category", 400);
  if (categoryRow.kind !== "academics") {
    return error("validation_error", `category "${categoryRow.id}" does not support subjects`, 400);
  }

  const now = nowIso();
  const subject = {
    id: crypto.randomUUID(),
    name: body.name.trim(),
    category_id: categoryRow.id,
    color: body.color.trim(),
    sort_order: body.sort_order ?? 0,
    active: 1,
    created_at: now,
    updated_at: now,
  };

  try {
    await run(
      env.DB,
      "INSERT INTO subjects (id, name, category_id, color, sort_order, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      Object.values(subject),
    );
  } catch (e) {
    if (String(e.message || e).toLowerCase().includes("unique")) {
      return error("conflict", "A subject with this name already exists", 409);
    }
    throw e;
  }

  return ok(subject, 201);
}

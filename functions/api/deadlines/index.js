// /api/deadlines
//   GET  list active deadlines by calendar date range
//   POST create one deadline

import { queryAll, run } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import {
  deadlineDateParam,
  normalizeDeadlineInput,
  parseBooleanParam,
  rowToDeadline,
  validateDeadlineInput,
} from "../../_lib/deadlines.js";
import { nowIso } from "../../_lib/events.js";

function isUniqueConflict(err) {
  return /UNIQUE constraint failed|unique/i.test(String(err?.message || err));
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const from = deadlineDateParam(url.searchParams.get("from"));
  const to = deadlineDateParam(url.searchParams.get("to"));
  const category = url.searchParams.get("category");
  const includeCompleted = parseBooleanParam(url.searchParams.get("include_completed"), true);

  if (from === undefined || to === undefined) return error("validation_error", "from and to must be valid YYYY-MM-DD dates", 400);
  if (from && to && to < from) return error("validation_error", "to must not be before from", 400);
  if (includeCompleted === null) return error("validation_error", "include_completed must be true, false, 1, or 0", 400);
  if (category !== null && category !== undefined && category.trim() === "") return error("validation_error", "category must not be empty", 400);

  let sql = "SELECT * FROM deadlines WHERE deleted_at IS NULL";
  const params = [];
  if (from) { sql += " AND substr(due_time, 1, 10) >= ?"; params.push(from); }
  if (to) { sql += " AND substr(due_time, 1, 10) <= ?"; params.push(to); }
  if (!includeCompleted) sql += " AND completed_at IS NULL";
  if (category) { sql += " AND category = ?"; params.push(category); }
  sql += ` ORDER BY substr(due_time, 1, 10) ASC,
    CASE WHEN all_day = 1 THEN 0 ELSE 1 END ASC,
    CASE WHEN all_day = 1 THEN 0 ELSE julianday(due_time) END ASC,
    id ASC`;

  const rows = await queryAll(env.DB, sql, params);
  return ok(rows.map(rowToDeadline));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => null);
  const message = validateDeadlineInput(body, true);
  if (message) return error("validation_error", message, 400);

  const input = normalizeDeadlineInput(body);
  const now = nowIso();
  const deadline = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    description: input.description ?? null,
    due_time: input.due_time,
    all_day: input.all_day === 1 ? 1 : 0,
    category: input.category ?? null,
    color: input.color ?? null,
    group_title: input.group_title ?? null,
    priority: input.priority || "default",
    source: input.source || "web",
    external_id: input.external_id ?? null,
    created_at: now,
    updated_at: now,
    completed_at: null,
    deleted_at: null,
  };

  try {
    await run(
      env.DB,
      `INSERT INTO deadlines
        (id, title, description, due_time, all_day, category, color, group_title,
         priority, source, external_id, created_at, updated_at, completed_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Object.values(deadline),
    );
  } catch (err) {
    if (isUniqueConflict(err)) return error("conflict", "A deadline with this source and external_id already exists", 409);
    throw err;
  }

  return ok(rowToDeadline(deadline), 201);
}

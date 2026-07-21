// /api/deadlines
//   GET  list active deadlines by calendar date range
//   POST create one deadline

import { queryAll, batch } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import {
  deadlineDateParam,
  normalizeDeadlineInput,
  parseBooleanParam,
  rowToDeadline,
  validateDeadlineInput,
} from "../../_lib/deadlines.js";
import { nowIso } from "../../_lib/events.js";
import { deadlineReminderStatements } from "../../_lib/reminders.js";
import { attachTagsToDeadlines, ensureTagIdsExist, replaceTagStatements, tagsForOwner, validateTagIds } from "../../_lib/tags.js";

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
  const tagIds = url.searchParams.getAll("tag").filter(Boolean);

  if (from === undefined || to === undefined) return error("validation_error", "from and to must be valid YYYY-MM-DD dates", 400);
  if (from && to && to < from) return error("validation_error", "to must not be before from", 400);
  if (includeCompleted === null) return error("validation_error", "include_completed must be true, false, 1, or 0", 400);
  if (category !== null && category !== undefined && category.trim() === "") return error("validation_error", "category must not be empty", 400);
  if (new Set(tagIds).size !== tagIds.length) return error("validation_error", "tag query parameters must not contain duplicates", 400);

  let sql = "SELECT * FROM deadlines WHERE deleted_at IS NULL";
  const params = [];
  if (from) { sql += " AND substr(due_time, 1, 10) >= ?"; params.push(from); }
  if (to) { sql += " AND substr(due_time, 1, 10) <= ?"; params.push(to); }
  if (!includeCompleted) sql += " AND completed_at IS NULL";
  if (category) { sql += " AND category = ?"; params.push(category); }
  if (tagIds.length) {
    const placeholders = tagIds.map(() => "?").join(", ");
    sql += ` AND id IN (SELECT deadline_id FROM deadline_tags WHERE tag_id IN (${placeholders}) GROUP BY deadline_id HAVING COUNT(DISTINCT tag_id) = ?)`;
    params.push(...tagIds, tagIds.length);
  }
  const whereSql = sql.replace(/^SELECT \* FROM deadlines WHERE /, "");
  sql += ` ORDER BY substr(due_time, 1, 10) ASC,
    CASE WHEN all_day = 1 THEN 0 ELSE 1 END ASC,
    CASE WHEN all_day = 1 THEN 0 ELSE julianday(due_time) END ASC,
    id ASC`;

  const rows = await queryAll(env.DB, sql, params);
  const taggedRows = await attachTagsToDeadlines(env, rows, whereSql, params);
  return ok(taggedRows.map(rowToDeadline));
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json().catch(() => null);
  const message = validateDeadlineInput(body, true);
  if (message) return error("validation_error", message, 400);
  const tagMessage = body.tag_ids === undefined ? null : validateTagIds(body.tag_ids);
  if (tagMessage) return error("validation_error", tagMessage, 400);
  if (body.tag_ids !== undefined) {
    const tagExistsMessage = await ensureTagIdsExist(env, body.tag_ids);
    if (tagExistsMessage) return error("validation_error", tagExistsMessage, 400);
  }

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
    const statements = [env.DB.prepare(`INSERT INTO deadlines
        (id, title, description, due_time, all_day, category, color, group_title,
         priority, source, external_id, created_at, updated_at, completed_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(...Object.values(deadline)), ...deadlineReminderStatements(env.DB, deadline)];
    if (body.tag_ids !== undefined) statements.push(...replaceTagStatements(env.DB, "deadline_tags", "deadline_id", deadline.id, body.tag_ids, now));
    await batch(env.DB, statements);
  } catch (err) {
    if (isUniqueConflict(err)) return error("conflict", "A deadline with this source and external_id already exists", 409);
    throw err;
  }

  return ok({ ...rowToDeadline(deadline), tags: await tagsForOwner(env, "deadline_tags", "deadline_id", id) }, 201);
}

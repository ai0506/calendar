import { queryAll, queryOne } from "./db.js";

export const MAX_TAGS_PER_ITEM = 5;

export function validateTagIds(value) {
  if (!Array.isArray(value)) return "tag_ids must be an array";
  if (value.length > MAX_TAGS_PER_ITEM) return `tag_ids must contain at most ${MAX_TAGS_PER_ITEM} items`;
  if (value.some((id) => typeof id !== "string" || id.trim() === "")) return "tag_ids must contain non-empty strings";
  if (new Set(value).size !== value.length) return "tag_ids must not contain duplicates";
  return null;
}

export function validateSuggestionTagIds(value) {
  if (!Array.isArray(value)) return "tag_ids must be an array";
  if (value.some((id) => typeof id !== "string" || id.trim() === "")) return "tag_ids must contain non-empty strings";
  if (new Set(value).size !== value.length) return "tag_ids must not contain duplicates";
  return null;
}

export async function ensureTagIdsExist(env, tagIds) {
  if (tagIds.length === 0) return null;
  const placeholders = tagIds.map(() => "?").join(", ");
  const rows = await queryAll(env.DB, `SELECT id FROM tags WHERE id IN (${placeholders})`, tagIds);
  return rows.length === tagIds.length ? null : "tag_ids contains an unknown tag";
}

export function replaceTagStatements(db, table, ownerColumn, ownerId, tagIds, now) {
  const statements = [db.prepare(`DELETE FROM ${table} WHERE ${ownerColumn} = ?`).bind(ownerId)];
  for (const tagId of tagIds) {
    statements.push(db.prepare(`INSERT INTO ${table} (${ownerColumn}, tag_id, created_at) VALUES (?, ?, ?)`)
      .bind(ownerId, tagId, now));
  }
  return statements;
}

export async function tagsForOwner(env, table, ownerColumn, ownerId) {
  return queryAll(env.DB, `SELECT t.id, t.name, t.color
    FROM ${table} link JOIN tags t ON t.id = link.tag_id
    WHERE link.${ownerColumn} = ? ORDER BY t.sort_order ASC, t.name ASC`, [ownerId]);
}

function publicTag(row) {
  return { id: row.id, name: row.name, color: row.color };
}

export async function attachTagsToEvents(env, rows, whereSql, params) {
  if (rows.length === 0) return rows.map((row) => ({ ...row, tags: [] }));
  const normalSql = `SELECT et.event_id AS owner_id, t.id, t.name, t.color, t.sort_order
    FROM event_tags et JOIN tags t ON t.id = et.tag_id
    WHERE et.event_id IN (SELECT id FROM events WHERE ${whereSql} AND series_id IS NULL)
    ORDER BY t.sort_order ASC, t.name ASC`;
  const seriesSql = `SELECT est.series_id AS owner_id, t.id, t.name, t.color, t.sort_order
    FROM event_series_tags est JOIN tags t ON t.id = est.tag_id
    WHERE est.series_id IN (SELECT DISTINCT series_id FROM events WHERE ${whereSql} AND series_id IS NOT NULL)
    ORDER BY t.sort_order ASC, t.name ASC`;
  const [normalRows, seriesRows] = await Promise.all([
    queryAll(env.DB, normalSql, params),
    queryAll(env.DB, seriesSql, params),
  ]);
  const normal = new Map();
  const series = new Map();
  for (const tag of normalRows) {
    if (!normal.has(tag.owner_id)) normal.set(tag.owner_id, []);
    normal.get(tag.owner_id).push(publicTag(tag));
  }
  for (const tag of seriesRows) {
    if (!series.has(tag.owner_id)) series.set(tag.owner_id, []);
    series.get(tag.owner_id).push(publicTag(tag));
  }
  return rows.map((row) => ({ ...row, tags: row.series_id ? (series.get(row.series_id) || []) : (normal.get(row.id) || []) }));
}

export async function attachTagsToDeadlines(env, rows, whereSql, params) {
  if (rows.length === 0) return rows.map((row) => ({ ...row, tags: [] }));
  const tagRows = await queryAll(env.DB, `SELECT dt.deadline_id AS owner_id, t.id, t.name, t.color, t.sort_order
    FROM deadline_tags dt JOIN tags t ON t.id = dt.tag_id
    WHERE dt.deadline_id IN (SELECT id FROM deadlines WHERE ${whereSql})
    ORDER BY t.sort_order ASC, t.name ASC`, params);
  const byDeadline = new Map();
  for (const tag of tagRows) {
    if (!byDeadline.has(tag.owner_id)) byDeadline.set(tag.owner_id, []);
    byDeadline.get(tag.owner_id).push(publicTag(tag));
  }
  return rows.map((row) => ({ ...row, tags: byDeadline.get(row.id) || [] }));
}

export async function activeTagUse(env, id) {
  const [event, deadline, series] = await Promise.all([
    queryOne(env.DB, `SELECT 1 FROM event_tags et JOIN events e ON e.id = et.event_id
      WHERE et.tag_id = ? AND e.deleted_at IS NULL LIMIT 1`, [id]),
    queryOne(env.DB, `SELECT 1 FROM deadline_tags dt JOIN deadlines d ON d.id = dt.deadline_id
      WHERE dt.tag_id = ? AND d.deleted_at IS NULL LIMIT 1`, [id]),
    queryOne(env.DB, `SELECT 1 FROM event_series_tags st JOIN event_series s ON s.id = st.series_id
      WHERE st.tag_id = ? AND s.deleted_at IS NULL LIMIT 1`, [id]),
  ]);
  return Boolean(event || deadline || series);
}

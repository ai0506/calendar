import { queryAll, queryOne, batch } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import { validateSuggestionTagIds, ensureTagIdsExist } from "../../_lib/tags.js";

export async function onRequestPut(context) {
  const { env, params, request } = context;
  const category = await queryOne(env.DB, "SELECT id FROM categories WHERE id = ?", [params.categoryId]);
  if (!category) return error("not_found", "Category not found", 404);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return error("validation_error", "Request body must be a JSON object", 400);
  const message = validateSuggestionTagIds(body.tag_ids);
  if (message) return error("validation_error", message, 400);
  const existsMessage = await ensureTagIdsExist(env, body.tag_ids);
  if (existsMessage) return error("validation_error", existsMessage, 400);
  const statements = [env.DB.prepare("DELETE FROM category_tag_suggestions WHERE category_id = ?").bind(params.categoryId)];
  body.tag_ids.forEach((tagId, index) => statements.push(env.DB.prepare(
    "INSERT INTO category_tag_suggestions (category_id, tag_id, sort_order) VALUES (?, ?, ?)",
  ).bind(params.categoryId, tagId, index + 1)));
  await batch(env.DB, statements);
  const rows = await queryAll(env.DB, "SELECT tag_id FROM category_tag_suggestions WHERE category_id = ? ORDER BY sort_order, tag_id", [params.categoryId]);
  return ok({ category_id: params.categoryId, tag_ids: rows.map((row) => row.tag_id) });
}

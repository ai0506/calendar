import { queryOne, batch } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import { activeTagUse } from "../../_lib/tags.js";

function validateTag(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Request body must be a JSON object";
  if (body.name !== undefined && (typeof body.name !== "string" || body.name.trim() === "")) return "name must be a non-empty string";
  if (typeof body.name === "string" && body.name.includes("|")) return "name must not contain |";
  if (body.color !== undefined && body.color !== null && typeof body.color !== "string") return "color must be a string or null";
  if (body.sort_order !== undefined && typeof body.sort_order !== "number") return "sort_order must be a number";
  return null;
}

async function getTag(env, id) {
  return queryOne(env.DB, "SELECT * FROM tags WHERE id = ?", [id]);
}

export async function onRequestGet(context) {
  const tag = await getTag(context.env, context.params.id);
  return tag ? ok(tag) : error("not_found", "Tag not found", 404);
}

export async function onRequestPut(context) {
  const tag = await getTag(context.env, context.params.id);
  if (!tag) return error("not_found", "Tag not found", 404);
  const body = await context.request.json().catch(() => null);
  const message = validateTag(body);
  if (message) return error("validation_error", message, 400);
  const updated = { ...tag, ...body, name: body.name === undefined ? tag.name : body.name.trim() };
  try {
    await context.env.DB.prepare("UPDATE tags SET name = ?, color = ?, sort_order = ? WHERE id = ?")
      .bind(updated.name, updated.color, updated.sort_order, tag.id).run();
  } catch (err) {
    if (/unique/i.test(String(err?.message || err))) return error("conflict", "Tag name already exists", 409);
    throw err;
  }
  return ok(await getTag(context.env, tag.id));
}

export async function onRequestDelete(context) {
  const tag = await getTag(context.env, context.params.id);
  if (!tag) return error("not_found", "Tag not found", 404);
  if (await activeTagUse(context.env, tag.id)) return error("conflict", "Tag is used by an active item", 409);
  await batch(context.env.DB, [
    context.env.DB.prepare("DELETE FROM event_tags WHERE tag_id = ?").bind(tag.id),
    context.env.DB.prepare("DELETE FROM deadline_tags WHERE tag_id = ?").bind(tag.id),
    context.env.DB.prepare("DELETE FROM event_series_tags WHERE tag_id = ?").bind(tag.id),
    context.env.DB.prepare("DELETE FROM category_tag_suggestions WHERE tag_id = ?").bind(tag.id),
    context.env.DB.prepare("DELETE FROM tags WHERE id = ?").bind(tag.id),
  ]);
  return ok({ id: tag.id, deleted: true });
}

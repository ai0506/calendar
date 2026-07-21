import { queryAll, run } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import { nowIso } from "../../_lib/events.js";

function validateTag(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Request body must be a JSON object";
  if (typeof body.name !== "string" || body.name.trim() === "") return "name is required and must be a non-empty string";
  if (body.name.includes("|")) return "name must not contain |";
  if (body.color !== undefined && body.color !== null && typeof body.color !== "string") return "color must be a string or null";
  if (body.sort_order !== undefined && typeof body.sort_order !== "number") return "sort_order must be a number";
  return null;
}

export async function onRequestGet(context) {
  return ok(await queryAll(context.env.DB, "SELECT * FROM tags ORDER BY sort_order ASC, name ASC"));
}

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  const message = validateTag(body);
  if (message) return error("validation_error", message, 400);
  const tag = { id: crypto.randomUUID(), name: body.name.trim(), color: body.color ?? null, sort_order: body.sort_order ?? 0, created_at: nowIso() };
  try {
    await run(context.env.DB, "INSERT INTO tags (id, name, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?)", Object.values(tag));
  } catch (err) {
    if (/unique/i.test(String(err?.message || err))) return error("conflict", "Tag name already exists", 409);
    throw err;
  }
  return ok(tag, 201);
}

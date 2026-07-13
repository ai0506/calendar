import { run } from "../../_lib/db.js";
import { error, ok } from "../../_lib/response.js";
import { nowIso } from "../../_lib/events.js";

export async function onRequestPatch(context) {
  const { env, params } = context;
  const result = await run(env.DB, "UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?", [nowIso(), params.id]);
  if (!result.meta || result.meta.changes === 0) return error("not_found", "Notification not found", 404);
  return ok({ id: params.id, read: true });
}

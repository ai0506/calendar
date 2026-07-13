import { run } from "../../_lib/db.js";
import { ok } from "../../_lib/response.js";
import { nowIso } from "../../_lib/events.js";

export async function onRequestPost(context) {
  const { env } = context;
  const result = await run(env.DB, "UPDATE notifications SET read_at = ? WHERE read_at IS NULL", [nowIso()]);
  return ok({ updated: Number(result.meta?.changes || 0) });
}

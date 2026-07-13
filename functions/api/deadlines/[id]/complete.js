import { batch } from "../../../_lib/db.js";
import { ok, error } from "../../../_lib/response.js";
import { activeDeadline, nowIso, rowToDeadline } from "../../../_lib/deadlines.js";
import { cancelTargetStatement } from "../../../_lib/reminders.js";

export async function onRequestPost(context) {
  const { env, params } = context;
  const completedAt = nowIso();
  const current = await activeDeadline(env, params.id);
  if (!current) return error("not_found", "Deadline not found", 404);
  if (!current.completed_at) {
    await batch(env.DB, [
      env.DB.prepare(`UPDATE deadlines SET completed_at = ?, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL AND completed_at IS NULL`).bind(completedAt, completedAt, params.id),
      cancelTargetStatement(env.DB, "deadline", params.id, completedAt),
    ]);
  }
  return ok(rowToDeadline(await activeDeadline(env, params.id)));
}

import { batch } from "../../../_lib/db.js";
import { ok, error } from "../../../_lib/response.js";
import { activeDeadline, nowIso, rowToDeadline } from "../../../_lib/deadlines.js";
import { deadlineReminderStatements } from "../../../_lib/reminders.js";

export async function onRequestPost(context) {
  const { env, params } = context;
  const updatedAt = nowIso();
  const current = await activeDeadline(env, params.id);
  if (!current) return error("not_found", "Deadline not found", 404);
  if (current.completed_at) {
    const reopened = { ...current, completed_at: null, updated_at: updatedAt };
    await batch(env.DB, [
      env.DB.prepare(`UPDATE deadlines SET completed_at = NULL, updated_at = ?
        WHERE id = ? AND deleted_at IS NULL AND completed_at IS NOT NULL`).bind(updatedAt, params.id),
      ...deadlineReminderStatements(env.DB, reopened),
    ]);
  }
  return ok(rowToDeadline(await activeDeadline(env, params.id)));
}

import { run } from "../../../_lib/db.js";
import { ok, error } from "../../../_lib/response.js";
import { activeDeadline, nowIso, rowToDeadline } from "../../../_lib/deadlines.js";

export async function onRequestPost(context) {
  const { env, params } = context;
  const updatedAt = nowIso();
  const result = await run(
    env.DB,
    `UPDATE deadlines SET completed_at = NULL, updated_at = ?
     WHERE id = ? AND deleted_at IS NULL AND completed_at IS NOT NULL`,
    [updatedAt, params.id],
  );
  const current = await activeDeadline(env, params.id);
  if (!current) return error("not_found", "Deadline not found", 404);
  if (!result.meta || result.meta.changes === 0) return ok(rowToDeadline(current));
  return ok(rowToDeadline(current));
}

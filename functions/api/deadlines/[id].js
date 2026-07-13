// /api/deadlines/:id
//   GET    get one active deadline
//   PUT    update editable fields
//   DELETE soft-delete one deadline

import { batch } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import {
  activeDeadline,
  deadlineFields,
  normalizeDeadlineInput,
  rowToDeadline,
  validateDeadlineInput,
} from "../../_lib/deadlines.js";
import { nowIso } from "../../_lib/events.js";
import { cancelTargetStatement, deadlineReminderStatements } from "../../_lib/reminders.js";

export async function onRequestGet(context) {
  const row = await activeDeadline(context.env, context.params.id);
  if (!row) return error("not_found", "Deadline not found", 404);
  return ok(rowToDeadline(row));
}

export async function onRequestPut(context) {
  const { request, env, params } = context;
  const existing = await activeDeadline(env, params.id);
  if (!existing) return error("not_found", "Deadline not found", 404);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return error("validation_error", "Request body must be a JSON object", 400);
  }
  if (body.source !== undefined || body.external_id !== undefined) {
    return error("validation_error", "source and external_id cannot be modified", 400);
  }

  const merged = { ...existing, ...body };
  const message = validateDeadlineInput(merged, true);
  if (message) return error("validation_error", message, 400);
  const input = normalizeDeadlineInput(body);
  const sets = [];
  const values = [];
  for (const field of deadlineFields()) {
    if (field === "source" || field === "external_id" || input[field] === undefined) continue;
    sets.push(`${field} = ?`);
    values.push(field === "all_day" ? input[field] : field === "title" ? input[field].trim() : input[field]);
  }
  sets.push("updated_at = ?");
  values.push(nowIso(), params.id);

  const changedPlan = input.due_time !== undefined || input.all_day !== undefined || input.priority !== undefined;
  const updatedForPlan = { ...existing, ...input, all_day: input.all_day === undefined ? existing.all_day : input.all_day };
  const statements = [env.DB.prepare(`UPDATE deadlines SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`).bind(...values)];
  if (changedPlan) {
    statements.push(cancelTargetStatement(env.DB, "deadline", params.id, values[values.length - 2]));
    statements.push(...deadlineReminderStatements(env.DB, updatedForPlan));
  }
  await batch(env.DB, statements);
  const updated = await activeDeadline(env, params.id);
  if (!updated) return error("not_found", "Deadline not found", 404);
  return ok(rowToDeadline(updated));
}

export async function onRequestDelete(context) {
  const { env, params } = context;
  const now = nowIso();
  const existing = await activeDeadline(env, params.id);
  if (!existing) return error("not_found", "Deadline not found", 404);
  await batch(env.DB, [
    env.DB.prepare("UPDATE deadlines SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL").bind(now, now, params.id),
    cancelTargetStatement(env.DB, "deadline", params.id, now),
  ]);
  return ok({ id: params.id, deleted: true });
}

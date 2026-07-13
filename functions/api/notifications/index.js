import { queryAll, queryOne } from "../../_lib/db.js";
import { cleanupNotifications, dispatchDueReminders } from "../../_lib/reminders.js";
import { error, ok } from "../../_lib/response.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const includeRead = url.searchParams.get("include_read") === "true";
  const parsedLimit = Number(url.searchParams.get("limit") || 50);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    return error("validation_error", "limit must be an integer from 1 to 100", 400);
  }
  const now = new Date();
  await dispatchDueReminders(env, now);
  await cleanupNotifications(env, now);
  const where = includeRead ? "" : "WHERE read_at IS NULL";
  const items = await queryAll(env.DB, `SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ?`, [parsedLimit]);
  const unread = await queryOne(env.DB, "SELECT COUNT(*) AS count FROM notifications WHERE read_at IS NULL");
  return ok({ items, unread_count: Number(unread?.count || 0) });
}

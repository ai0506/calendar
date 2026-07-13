// POST /api/events/import
// 批量导入事件（供 AI Agent / CSV 导入工具 / Android App / 外部程序使用）。
// 按 (source, external_id) 唯一约束去重：已存在则更新，不存在则新建。
// 时间保持 ISO 8601 带时区偏移，不强制转 UTC（沿用 _lib/events.js 的校验逻辑）。

import { queryOne, batch } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import { validateEventInput, validateEventTemporalOrder, nowIso, toIntBool } from "../../_lib/events.js";
import {
  cancelTargetStatement,
  configStatement,
  effectiveEventReminders,
  eventReminderStatements,
  requestedReminders,
} from "../../_lib/reminders.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.events)) {
    return error("validation_error", "Request body must contain an \"events\" array", 400);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of body.events) {
    if (!item || typeof item !== "object") {
      skipped++;
      continue;
    }

    const msg = validateEventInput(item, true);
    if (msg) {
      skipped++;
      continue;
    }
    const temporalMsg = validateEventTemporalOrder(item);
    if (temporalMsg) {
      skipped++;
      continue;
    }
    const reminderRequest = requestedReminders(item, toIntBool(item.all_day) === 1);
    if (reminderRequest.error) { skipped++; continue; }

    const source = item.source ?? "web";
    const externalId = item.external_id ?? null;
    const now = nowIso();
    let eventColor = item.color ?? null;
    if (typeof eventColor === "string" && eventColor.toLowerCase() === "default") {
      eventColor = null;
    }
    if (item.category && item.color === undefined) {
      const category = await queryOne(env.DB, "SELECT color FROM categories WHERE name = ?", [item.category]);
      eventColor = category?.color ?? null;
    }

    // 无 external_id 时无法去重判定，直接作为新事件插入。
    let existing = null;
    if (externalId) {
      existing = await queryOne(
        env.DB,
        "SELECT * FROM events WHERE source = ? AND external_id = ? AND deleted_at IS NULL",
        [source, externalId],
      );
    }

    if (existing) {
      const event = {
        ...existing, title: item.title, description: item.description ?? null,
        start_time: item.start_time, end_time: item.end_time ?? null, all_day: toIntBool(item.all_day),
        category: item.category ?? null, color: eventColor, group_title: item.group_title ?? null, updated_at: now,
      };
      const changedPlan = existing.start_time !== event.start_time || existing.all_day !== event.all_day || reminderRequest.provided;
      const reminders = reminderRequest.provided
        ? reminderRequest.values
        : await effectiveEventReminders(env, existing.id, existing.series_id || null);
      const statements = [env.DB.prepare(`UPDATE events SET
           title = ?, description = ?, start_time = ?, end_time = ?, all_day = ?,
           category = ?, color = ?, group_title = ?, updated_at = ?
         WHERE id = ?`).bind(event.title, event.description, event.start_time, event.end_time,
        event.all_day, event.category, event.color, event.group_title, now, existing.id)];
      if (changedPlan) {
        statements.push(cancelTargetStatement(env.DB, "event", existing.id, now));
        if (reminderRequest.provided) statements.push(configStatement(env.DB, "event_reminder_configs", "event_id", existing.id, reminders, now));
        statements.push(...eventReminderStatements(env.DB, event, reminders));
      }
      await batch(env.DB, statements);
      updated++;
    } else {
      const id = crypto.randomUUID();
      const event = {
        id, title: item.title, description: item.description ?? null, start_time: item.start_time,
        end_time: item.end_time ?? null, all_day: toIntBool(item.all_day), category: item.category ?? null,
        color: eventColor, group_title: item.group_title ?? null, source, external_id: externalId,
        created_at: now, updated_at: now, deleted_at: null,
      };
      const reminders = reminderRequest.provided ? reminderRequest.values : [60, 10];
      const statements = [env.DB.prepare(`INSERT INTO events
           (id, title, description, start_time, end_time, all_day, category, color,
            group_title, source, external_id, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        event.id, event.title, event.description, event.start_time, event.end_time, event.all_day,
        event.category, event.color, event.group_title, event.source, event.external_id,
        event.created_at, event.updated_at, event.deleted_at)];
      if (reminderRequest.provided) statements.push(configStatement(env.DB, "event_reminder_configs", "event_id", id, reminders, now));
      statements.push(...eventReminderStatements(env.DB, event, reminders));
      await batch(env.DB, statements);
      created++;
    }
  }

  return ok({ created, updated, skipped });
}

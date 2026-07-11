// POST /api/events/import
// 批量导入事件（供 AI Agent / CSV 导入工具 / Android App / 外部程序使用）。
// 按 (source, external_id) 唯一约束去重：已存在则更新，不存在则新建。
// 时间保持 ISO 8601 带时区偏移，不强制转 UTC（沿用 _lib/events.js 的校验逻辑）。

import { queryOne, run } from "../../_lib/db.js";
import { ok, error } from "../../_lib/response.js";
import { validateEventInput, validateEventTemporalOrder, nowIso, toIntBool } from "../../_lib/events.js";

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

    const source = item.source ?? "web";
    const externalId = item.external_id ?? null;
    const now = nowIso();

    // 无 external_id 时无法去重判定，直接作为新事件插入。
    let existing = null;
    if (externalId) {
      existing = await queryOne(
        env.DB,
        "SELECT id FROM events WHERE source = ? AND external_id = ? AND deleted_at IS NULL",
        [source, externalId],
      );
    }

    if (existing) {
      await run(
        env.DB,
        `UPDATE events SET
           title = ?, description = ?, start_time = ?, end_time = ?, all_day = ?,
           category = ?, color = ?, group_title = ?, updated_at = ?
         WHERE id = ?`,
        [
          item.title,
          item.description ?? null,
          item.start_time,
          item.end_time ?? null,
          toIntBool(item.all_day),
          item.category ?? null,
          item.color ?? null,
          item.group_title ?? null,
          now,
          existing.id,
        ],
      );
      updated++;
    } else {
      const id = crypto.randomUUID();
      await run(
        env.DB,
        `INSERT INTO events
           (id, title, description, start_time, end_time, all_day, category, color,
            group_title, source, external_id, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          item.title,
          item.description ?? null,
          item.start_time,
          item.end_time ?? null,
          toIntBool(item.all_day),
          item.category ?? null,
          item.color ?? null,
          item.group_title ?? null,
          source,
          externalId,
          now,
          now,
          null,
        ],
      );
      created++;
    }
  }

  return ok({ created, updated, skipped });
}

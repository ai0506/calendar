// GET /api/export?format=json|csv|md
// 导出全部未软删除的事件，供程序处理 (json) / Excel (csv) / ChatGPT-Claude 分析 (md)。

import { queryAll } from "../_lib/db.js";
import { error } from "../_lib/response.js";
import { rowToEvent } from "../_lib/events.js";
import { attachTagsToEvents } from "../_lib/tags.js";

const CSV_COLUMNS = [
  "id",
  "title",
  "description",
  "start_time",
  "end_time",
  "all_day",
  "category",
  "color",
  "group_title",
  "source",
  "external_id",
  "tag_ids",
  "tag_names",
];

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(events) {
  const lines = [CSV_COLUMNS.join(",")];
  for (const e of events) {
    const row = {
      ...e,
      tag_ids: (e.tags || []).map((tag) => tag.id).join("|"),
      tag_names: (e.tags || []).map((tag) => tag.name).join("|"),
    };
    lines.push(CSV_COLUMNS.map((c) => csvEscape(row[c])).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

function toMarkdown(events) {
  const byDate = new Map();
  for (const e of events) {
    const date = e.start_time.slice(0, 10); // YYYY-MM-DD
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(e);
  }

  const dates = [...byDate.keys()].sort();
  const lines = ["# Calendar", ""];
  for (const date of dates) {
    lines.push(`## ${date}`, "");
    const items = byDate.get(date).sort((a, b) => a.start_time.localeCompare(b.start_time));
    for (const e of items) {
      const time = e.all_day ? "All day" : e.start_time.slice(11, 16);
      const category = e.category ? ` [${e.category}]` : "";
      const tags = e.tags?.length ? ` {${e.tags.map((tag) => tag.name).join(" · ")}}` : "";
      lines.push(`- ${time} ${e.title}${category}${tags}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  const rows = await queryAll(
    env.DB,
    "SELECT * FROM events WHERE deleted_at IS NULL ORDER BY start_time ASC",
  );
  const events = (await attachTagsToEvents(env, rows, "deleted_at IS NULL", [])).map(rowToEvent);

  if (format === "json") {
    return new Response(JSON.stringify({ ok: true, data: events }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  if (format === "csv") {
    return new Response(toCsv(events), {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8" },
    });
  }

  if (format === "md") {
    return new Response(toMarkdown(events), {
      status: 200,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  return error("validation_error", "format must be one of: json, csv, md", 400);
}

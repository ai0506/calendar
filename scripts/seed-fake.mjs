#!/usr/bin/env node
// 把 fixtures/sample-workspace.json materialize 成本地 D1 的 SQL，打到 stdout。
//
// 只给本地开发和手动测试用：INSERT OR REPLACE 会按 fixture 反向对齐本地库，
// 所以不要拿它跑 --remote。
//
//   node scripts/seed-fake.mjs > /tmp/fake.sql
//   wrangler d1 execute calendar-db --local --file=/tmp/fake.sql
//
// 或直接 npm run db:seed-fake。

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "..", "fixtures", "sample-workspace.json"), "utf8"));

// --- fixture 自身的一致性检查 ---------------------------------------------
// 引用不存在的分类 / 学科 / 标签必须当场失败。Reminders 那边就因为照着文档写、
// 没有核对迁移，把 Projects 写成了 "AI0506 Project"、Leisure 写成了 "Personal"。
const categoryNames = new Set(fixture.categories.map((c) => c.name));
const subjectIDs = new Set(fixture.subjects.map((s) => s.id));
const tagIDs = new Set(fixture.tags.map((t) => t.id));
const categoryByName = new Map(fixture.categories.map((c) => [c.name, c]));

const problems = [];
for (const d of fixture.deadlines) {
  if (!categoryNames.has(d.category)) problems.push(`${d.id}: 分类 "${d.category}" 不在 categories 里`);
  if (d.subject_id) {
    if (!subjectIDs.has(d.subject_id)) problems.push(`${d.id}: 学科 "${d.subject_id}" 不在 subjects 里`);
    const category = categoryByName.get(d.category);
    if (category && category.kind !== "academics") {
      problems.push(`${d.id}: 只有 kind=academics 的分类能带 subject_id，"${d.category}" 不是`);
    }
  }
  for (const tag of d.tag_ids) {
    if (!tagIDs.has(tag)) problems.push(`${d.id}: 标签 "${tag}" 不在 tags 里`);
  }
  if (d.tag_ids.length > 5) problems.push(`${d.id}: 标签超过 5 个，后端会拒`);
  if (d.all_day && d.due_time !== null) problems.push(`${d.id}: 全天项的 due_time 必须是 null`);
  if (!d.all_day && !d.due_time) problems.push(`${d.id}: 定时项缺 due_time`);
}
if (problems.length) {
  console.error("fixture 有问题：\n  " + problems.join("\n  "));
  process.exit(1);
}

// --- 相对天数 -> 上海时间的绝对日期 ----------------------------------------
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiDateKey(offsetDays) {
  const now = new Date(Date.now() + SHANGHAI_OFFSET_MS);
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return now.toISOString().slice(0, 10);
}

function dueTimeFor(deadline) {
  const day = shanghaiDateKey(deadline.due_offset_days);
  return deadline.all_day ? day : `${day}T${deadline.due_time}:00+08:00`;
}

const nowISO = new Date(Date.now() + SHANGHAI_OFFSET_MS).toISOString().replace("Z", "+08:00");
const q = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replace(/'/g, "''")}'`);

const lines = [
  "-- 由 scripts/seed-fake.mjs 从 fixtures/sample-workspace.json 生成，不要手改。",
  "-- 只用于本地 D1（--local）。",
  "",
  "-- 先清掉上一轮的假数据，保证可重复执行。",
  "DELETE FROM deadline_tags WHERE deadline_id LIKE 'fake-%';",
  "DELETE FROM deadlines WHERE id LIKE 'fake-%';",
  ""
];

for (const c of fixture.categories) {
  lines.push(
    `INSERT OR REPLACE INTO categories (id, name, color, sort_order, created_at, kind, archived) VALUES ` +
    `(${q(c.id)}, ${q(c.name)}, ${q(c.color)}, ${c.sort_order}, ${q(nowISO)}, ${q(c.kind)}, ${c.archived});`
  );
}
lines.push("");

for (const s of fixture.subjects) {
  lines.push(
    `INSERT OR REPLACE INTO subjects (id, name, category_id, color, sort_order, active, created_at, updated_at) VALUES ` +
    `(${q(s.id)}, ${q(s.name)}, ${q(s.category_id)}, ${q(s.color)}, ${s.sort_order}, ${s.active}, ${q(nowISO)}, ${q(nowISO)});`
  );
}
lines.push("");

for (const t of fixture.tags) {
  lines.push(`INSERT OR REPLACE INTO tags (id, name, color, created_at) VALUES (${q(t.id)}, ${q(t.name)}, ${q(t.color)}, ${q(nowISO)});`);
}
lines.push("");

for (const d of fixture.deadlines) {
  lines.push(
    `INSERT OR REPLACE INTO deadlines (id, title, description, due_time, all_day, category, subject_id, color, group_title, source, external_id, created_at, updated_at, completed_at, deleted_at) VALUES ` +
    `(${q(d.id)}, ${q(d.title)}, ${q(d.description || null)}, ${q(dueTimeFor(d))}, ${d.all_day ? 1 : 0}, ${q(d.category)}, ${q(d.subject_id)}, NULL, NULL, 'fixture', NULL, ${q(nowISO)}, ${q(nowISO)}, ${d.completed ? q(nowISO) : "NULL"}, NULL);`
  );
  for (const tag of d.tag_ids) {
    lines.push(`INSERT OR REPLACE INTO deadline_tags (deadline_id, tag_id) VALUES (${q(d.id)}, ${q(tag)});`);
  }
}

process.stdout.write(lines.join("\n") + "\n");

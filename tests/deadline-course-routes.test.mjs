// Course × Deadline 的路由级测试：REST /api/course-catalog、/api/deadlines
// 与 MCP 的 create/update/get/list，验证 course_id 真的走通了校验、持久化与回传。
// 数据库用 tests/helpers/fake-d1.mjs 的桩，不连本地或远端 D1。

import assert from "node:assert/strict";
import { createFakeD1, jsonRequest, readJson } from "./helpers/fake-d1.mjs";
import { onRequestGet as courseCatalogGet } from "../functions/api/course-catalog/index.js";
import { onRequestPost as deadlinesPost } from "../functions/api/deadlines/index.js";
import { onRequestGet as deadlineGet, onRequestPut as deadlinePut } from "../functions/api/deadlines/[id].js";
import { onRequestPost as mcpPost } from "../functions/mcp/index.js";

const MCP_TOKEN = "test-write-token";

function seed() {
  return {
    categories: [
      { id: "cat-academics", name: "Academics", kind: "academics", archived: 0 },
      { id: "cat-projects", name: "Projects", kind: "normal", archived: 0 },
    ],
    subjects: [
      { id: "sub-english", category_id: "cat-academics", active: 1 },
      { id: "sub-physics", category_id: "cat-academics", active: 1 },
    ],
    courses: [
      { id: "course-eng", name: "English Literature", subject_id: "sub-english", active: 1 },
      { id: "course-eng-old", name: "English (2025)", subject_id: "sub-english", active: 0 },
      { id: "course-phy", name: "Physics", subject_id: "sub-physics", active: 1 },
    ],
  };
}

function newEnv() {
  const { db, tables } = createFakeD1(seed());
  return { env: { DB: db, MCP_WRITE_TOKEN: MCP_TOKEN }, tables };
}

function deadlineBody(extra = {}) {
  return {
    title: "Essay draft",
    due_time: "2026-09-25",
    all_day: true,
    category: "Academics",
    subject_id: "sub-english",
    ...extra,
  };
}

async function post(env, body) {
  return readJson(await deadlinesPost({ request: jsonRequest("https://x/api/deadlines", "POST", body), env }));
}

async function put(env, id, body) {
  return readJson(await deadlinePut({ request: jsonRequest(`https://x/api/deadlines/${id}`, "PUT", body), env, params: { id } }));
}

async function mcpCall(env, name, args) {
  const response = await mcpPost({
    request: jsonRequest("https://x/mcp", "POST", {
      jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args },
    }, { Authorization: `Bearer ${MCP_TOKEN}` }),
    env,
  });
  const payload = await response.json();
  const text = payload.result?.content?.[0]?.text ?? "";
  return { isError: payload.result?.isError === true, text, data: payload.result?.isError ? null : JSON.parse(text) };
}

// --- GET /api/course-catalog ---------------------------------------------
{
  const { env } = newEnv();
  const { status, body } = await readJson(await courseCatalogGet({ env }));
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.data.length, 3);
  // inactive Course 必须留在 catalog 里：Reminders 要靠它做历史课程的名称命中。
  assert.ok(body.data.some((course) => course.id === "course-eng-old" && course.active === 0));
  assert.deepEqual(Object.keys(body.data[0]).sort(), ["active", "id", "name", "subject_id"]);
}

// --- POST /api/deadlines --------------------------------------------------
{
  const { env, tables } = newEnv();
  const created = await post(env, deadlineBody({ course_id: "course-eng" }));
  assert.equal(created.status, 201);
  assert.equal(created.body.data.course_id, "course-eng");
  assert.equal(tables.deadlines[0].course_id, "course-eng");
}
{
  // 不带 course_id 时落 NULL，不受影响。
  const { env, tables } = newEnv();
  const created = await post(env, deadlineBody());
  assert.equal(created.status, 201);
  assert.equal(created.body.data.course_id, null);
  assert.equal(tables.deadlines[0].course_id, null);
}
{
  // inactive Course 允许新建关联（已冻结的产品决定）。
  const { env } = newEnv();
  const created = await post(env, deadlineBody({ course_id: "course-eng-old" }));
  assert.equal(created.status, 201);
  assert.equal(created.body.data.course_id, "course-eng-old");
}
{
  const { env, tables } = newEnv();
  const missing = await post(env, deadlineBody({ course_id: "course-nope" }));
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.code, "validation_error");
  assert.match(missing.body.error.message, /course_id does not exist/);
  assert.equal(tables.deadlines.length, 0);
}
{
  const { env } = newEnv();
  const mismatched = await post(env, deadlineBody({ course_id: "course-phy" }));
  assert.equal(mismatched.status, 400);
  assert.match(mismatched.body.error.message, /must belong to deadline subject_id/);
}
{
  const { env } = newEnv();
  const noSubject = await post(env, deadlineBody({ subject_id: undefined, course_id: "course-eng" }));
  assert.equal(noSubject.status, 400);
  assert.match(noSubject.body.error.message, /requires subject_id/);
}
{
  // 普通分类先被 Category/Subject 校验拦下，course_id 不会偷偷落库。
  const { env, tables } = newEnv();
  const wrongCategory = await post(env, deadlineBody({ category: "Projects", course_id: "course-eng" }));
  assert.equal(wrongCategory.status, 400);
  assert.equal(tables.deadlines.length, 0);
}

// --- PUT /api/deadlines/:id ----------------------------------------------
{
  const { env, tables } = newEnv();
  const created = await post(env, deadlineBody({ course_id: "course-eng" }));
  const id = created.body.data.id;

  const relinked = await put(env, id, { course_id: "course-eng-old" });
  assert.equal(relinked.status, 200);
  assert.equal(relinked.body.data.course_id, "course-eng-old");
  assert.equal(tables.deadlines[0].course_id, "course-eng-old");

  const cleared = await put(env, id, { course_id: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.course_id, null);

  const fetched = await readJson(await deadlineGet({ env, params: { id } }));
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.data.course_id, null);
}
{
  // 只改 subject_id 时用 merged state 校验：残留的 course_id 必须被拒绝，而不是留下不一致的行。
  const { env, tables } = newEnv();
  const created = await post(env, deadlineBody({ course_id: "course-eng" }));
  const id = created.body.data.id;
  const stale = await put(env, id, { subject_id: "sub-physics" });
  assert.equal(stale.status, 400);
  assert.match(stale.body.error.message, /must belong to deadline subject_id/);
  assert.equal(tables.deadlines[0].subject_id, "sub-english");
  assert.equal(tables.deadlines[0].course_id, "course-eng");

  // 同时改 subject_id 和 course_id 则通过。
  const moved = await put(env, id, { subject_id: "sub-physics", course_id: "course-phy" });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.data.course_id, "course-phy");
}

// --- MCP ------------------------------------------------------------------
{
  const { env, tables } = newEnv();
  const created = await mcpCall(env, "calendar_create_deadline", deadlineBody({ course_id: "course-eng" }));
  assert.equal(created.isError, false, created.text);
  assert.equal(created.data.course_id, "course-eng");
  assert.equal(tables.deadlines[0].course_id, "course-eng");
  const id = created.data.id;

  const got = await mcpCall(env, "calendar_get_deadline", { id });
  assert.equal(got.data.course_id, "course-eng");

  const listed = await mcpCall(env, "calendar_list_deadlines", { from: "2026-09-01", to: "2026-10-01" });
  assert.equal(listed.data[0].course_id, "course-eng");

  const updated = await mcpCall(env, "calendar_update", { type: "deadline", id, course_id: "course-eng-old" });
  assert.equal(updated.isError, false, updated.text);
  assert.equal(updated.data.course_id, "course-eng-old");

  const rejected = await mcpCall(env, "calendar_update", { type: "deadline", id, course_id: "course-phy" });
  assert.equal(rejected.isError, true);
  assert.match(rejected.text, /must belong to deadline subject_id/);
  assert.equal(tables.deadlines[0].course_id, "course-eng-old");

  const cleared = await mcpCall(env, "calendar_update", { type: "deadline", id, course_id: null });
  assert.equal(cleared.data.course_id, null);

  // 完成/重开后 course_id 仍然带回。
  const completed = await mcpCall(env, "calendar_complete_deadline", { id });
  assert.equal(completed.isError, false, completed.text);
  assert.ok("course_id" in completed.data);
}
{
  // course_id 是 Deadline 专属字段，calendar_update 不允许串到 Event 上。
  const { env } = newEnv();
  const event = await mcpCall(env, "calendar_update", { type: "event", id: "evt-1", course_id: "course-eng" });
  assert.equal(event.isError, true);
  assert.match(event.text, /course_id is not valid for type="event"/);
}

console.log("deadline course route tests passed");

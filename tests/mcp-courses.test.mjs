// Real in-memory SQLite + repository migrations exercise projection SQL and the
// MCP JSON-RPC/OAuth entry point. This is not a Cloudflare D1/deployment test.
// Requires Node >= 22.13 (node:sqlite); never reads credentials or a user's DB.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { getUpcomingCourses } from "../functions/_lib/course-schedule.js";
import { signAccessToken } from "../functions/_lib/oauth.js";
import { onRequestPost } from "../functions/mcp/index.js";

const origin = "https://calendar.test";
const secret = "course-tests-only-signing-secret";
const token = await signAccessToken({ sub: "test", aud: `${origin}/mcp`, scope: "calendar.read" }, secret);
const migrations = new URL("../migrations/", import.meta.url);
const sqlFiles = readdirSync(migrations).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
const databases = [];

function fixture(adjust = "") {
  const sqlite = new DatabaseSync(":memory:");
  databases.push(sqlite);
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of sqlFiles) sqlite.exec(readFileSync(new URL(file, migrations), "utf8"));
  if (adjust) sqlite.exec(adjust);
  sqlite.exec("PRAGMA query_only = ON");
  const DB = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params).map((row) => ({ ...row })) }; },
            async first() { const row = sqlite.prepare(sql).get(...params); return row ? { ...row } : null; },
            async run() { return sqlite.prepare(sql).run(...params); },
          };
        },
      };
    },
  };
  return { DB, SESSION_SECRET: secret };
}

async function rpc(env, method, params, accessToken = token) {
  const response = await onRequestPost({ env, request: new Request(`${origin}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }) });
  return { status: response.status, body: await response.json() };
}

async function call(env, args = {}) {
  const { status, body } = await rpc(env, "tools/call", { name: "calendar_get_courses", arguments: args });
  assert.equal(status, 200);
  assert.equal(body.result.isError, undefined, body.result.content[0].text);
  return JSON.parse(body.result.content[0].text);
}

try {
  const env = fixture();
  const { body: listed } = await rpc(env, "tools/list");
  const tool = listed.result.tools.find((entry) => entry.name === "calendar_get_courses");
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.inputSchema.properties.n.default, 1);
  assert.equal(listed.result.tools.length, 8); // read scope can discover and call it
  const fullToken = await signAccessToken({ sub: "test", aud: `${origin}/mcp`, scope: "calendar" }, secret);
  const full = await rpc(env, "tools/list", undefined, fullToken);
  assert.equal(full.body.result.tools.length, 20);
  const denied = await rpc(env, "tools/call", { name: "calendar_create_event", arguments: {} });
  assert.equal(denied.body.result.isError, true);
  assert.equal((await rpc(env, "tools/list", undefined, "invalid-token")).status, 401);

  // Monday: default n, names, precise times and room; no Event rows involved.
  const first = await call(env, { from: "2026-10-19T07:00:00+08:00" });
  assert.equal(first.courses.length, 13);
  assert.ok(first.courses.every((course) => course.id && course.name && course.subject_id));
  assert.equal(first.requested_count, 1);
  assert.equal(first.returned_count, 1);
  assert.equal(first.next_classes[0].title, "AS物理 L1");
  assert.equal(first.next_classes[0].start_time, "2026-10-19T08:00:00+08:00");
  assert.equal(first.next_classes[0].end_time, "2026-10-19T08:45:00+08:00");
  assert.equal(first.next_classes[0].room, "318");
  assert.equal(first.time_zone, "Asia/Shanghai");
  assert.equal(first.searched_through, "2027-10-19");
  const sameInstant = await call(env, { from: "2026-10-18T23:00:00Z" });
  assert.deepEqual(sameInstant, first);
  const defaultNow = await getUpcomingCourses(env, {}, new Date("2026-10-18T23:00:00Z"));
  assert.deepEqual(defaultNow, first);
  const beforeNow = Date.now();
  const liveDefault = await call(env);
  assert.equal(liveDefault.requested_count, 1);
  assert.ok(Date.parse(liveDefault.from) >= beforeNow && Date.parse(liveDefault.from) <= Date.now());
  assert.ok(liveDefault.next_classes.every((row) => Date.parse(row.start_time) >= Date.parse(liveDefault.from)));

  const next = await call(env, { n: 3, from: "2026-10-19T08:10:00+08:00" });
  assert.deepEqual(next.next_classes.map((row) => row.title), ["升旗", "AS经济", "Speaking L1A"]);
  assert.equal((await call(env, { from: "2026-10-19T08:00:00+08:00" })).next_classes[0].start_time,
    "2026-10-19T08:00:00+08:00"); // inclusive at the exact starting instant
  const byName = await call(env, { course_name: "  as数学 l1a  ", n: 2, from: "2026-10-19T07:00:00+08:00" });
  assert.equal(byName.selected_course_id, "course-g11-07");
  assert.deepEqual(byName.next_classes.map((row) => row.start_time), ["2026-10-19T15:15:00+08:00", "2026-10-20T14:20:00+08:00"]);
  const byId = await call(env, { course_id: "course-g11-02", n: 2, from: "2026-10-20T07:00:00+08:00" });
  assert.deepEqual(byId.next_classes.map((row) => row.start_time), ["2026-10-20T08:00:00+08:00", "2026-10-20T08:55:00+08:00"]);
  const weekend = await call(env, { from: "2026-10-17T12:00:00+08:00" });
  assert.equal(weekend.next_classes[0].date, "2026-10-19");
  const holiday = await call(env, { from: "2026-10-01T07:00:00+08:00" });
  assert.equal(holiday.next_classes[0].date, "2026-10-08");

  const leaveEnv = fixture(`
    INSERT INTO course_overrides (id,term_id,effective_date,kind,course_slot_id,created_at,updated_at)
    VALUES ('single','term-g11-2026-fall','2026-10-19','cancel','slot-g11-01','test','test');
    INSERT INTO course_overrides (id,term_id,effective_date,kind,created_at,updated_at)
    VALUES ('day','term-g11-2026-fall','2026-10-20','cancel_day','test','test');
  `);
  const leave = await call(leaveEnv, { n: 10, from: "2026-10-19T07:00:00+08:00" });
  assert.equal(leave.next_classes[0].title, "升旗");
  assert.ok(leave.next_classes.every((row) => row.date !== "2026-10-20"));

  const inactiveEnv = fixture("UPDATE courses SET active=0 WHERE id='course-g11-01'; UPDATE subjects SET active=0 WHERE id='sub-math';");
  const inactive = await call(inactiveEnv, { n: 50, from: "2026-10-19T07:00:00+08:00" });
  assert.ok(inactive.courses.some((course) => course.id === "course-g11-01" && course.active === 0));
  assert.ok(inactive.next_classes.every((row) => !["course-g11-01", "course-g11-07"].includes(row.course_id)));
  assert.deepEqual((await call(inactiveEnv, { course_id: "course-g11-01", from: "2026-10-19T07:00:00+08:00" })).next_classes, []);

  const weeksEnv = fixture("UPDATE course_slots SET week_pattern='odd', first_week=9, last_week=11 WHERE course_id='course-g11-07';");
  const weeks = await call(weeksEnv, { course_id: "course-g11-07", n: 50, from: "2026-10-19T07:00:00+08:00" });
  assert.ok(weeks.next_classes.length > 0);
  assert.ok(weeks.next_classes.every((row) => (row.date >= "2026-10-26" && row.date <= "2026-10-30") ||
    (row.date >= "2026-11-09" && row.date <= "2026-11-13")));
  const evenEnv = fixture("UPDATE course_slots SET week_pattern='even', first_week=9, last_week=11 WHERE course_id='course-g11-07';");
  const even = await call(evenEnv, { course_id: "course-g11-07", n: 50, from: "2026-10-19T07:00:00+08:00" });
  assert.ok(even.next_classes.length > 0);
  assert.ok(even.next_classes.every((row) => row.date >= "2026-11-02" && row.date <= "2026-11-06"));
  const futureTerm = await call(env, { from: "2026-08-15T07:00:00+08:00" });
  assert.equal(futureTerm.next_classes[0].date, "2026-08-31");

  const last = await call(env, { n: 50, from: "2027-01-29T16:00:00+08:00" });
  assert.equal(last.returned_count, 1);
  assert.equal(last.next_classes[0].start_time, "2027-01-29T16:05:00+08:00");
  assert.deepEqual((await call(env, { from: "2027-02-01T07:00:00+08:00" })).next_classes, []);
  assert.deepEqual((await call(env, { from: "2025-01-01T07:00:00+08:00" })).next_classes, []); // beyond horizon
  const emptyEnv = fixture("DELETE FROM course_slots; DELETE FROM courses; DELETE FROM terms;");
  const empty = await call(emptyEnv, { from: "2026-10-19T07:00:00+08:00" });
  assert.deepEqual(empty.courses, []);
  assert.deepEqual(empty.next_classes, []);

  const duplicateEnv = fixture("UPDATE courses SET name='AS物理 L1' WHERE id='course-g11-02';");
  const ambiguous = await rpc(duplicateEnv, "tools/call", { name: "calendar_get_courses", arguments: { course_name: "AS物理 L1" } });
  assert.equal(ambiguous.body.result.isError, true);
  assert.match(ambiguous.body.result.content[0].text, /ambiguous.*course-g11-01/);

  for (const args of [
    { n: 0 }, { n: -1 }, { n: 51 }, { n: 1.5 }, { n: "2" }, { n: null },
    { course_id: "missing" }, { course_id: "" }, { course_id: null },
    { course_name: "数学" }, { course_name: 3 }, { course_name: " " },
    { course_name: "AS物理 L1", course_id: "course-g11-01" },
    { from: "2026-10-19" }, { from: "2026-10-19T07:00:00" }, { from: "2026-02-30T07:00:00Z" },
    { from: "2026-10-19T24:00:00Z" }, { from: "2026-10-19T07:99:00Z" }, { from: null },
    { unexpected: true }, [],
  ]) {
    const result = await rpc(env, "tools/call", { name: "calendar_get_courses", arguments: args });
    assert.equal(result.body.result.isError, true, JSON.stringify(args));
  }
  // SQL failures must surface as errors, never masquerade as an empty timetable.
  const brokenEnv = fixture("DROP TABLE course_overrides;");
  const broken = await rpc(brokenEnv, "tools/call", { name: "calendar_get_courses", arguments: { from: "2026-10-19T07:00:00+08:00" } });
  assert.equal(broken.body.result.isError, true);
  console.log("MCP courses: catalog, next N, course filters, timezone, projection rules, validation and OAuth route tests passed");
} finally {
  for (const sqlite of databases) sqlite.close();
}

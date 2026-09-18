import assert from "node:assert/strict";
import { normalizeDeadlineInput, validateDeadlineCourse, validateDeadlineInput } from "../functions/_lib/deadlines.js";

const COURSES = {
  "course-active": { id: "course-active", subject_id: "sub-english", active: 1 },
  "course-retired": { id: "course-retired", subject_id: "sub-english", active: 0 },
  "course-physics": { id: "course-physics", subject_id: "sub-physics", active: 1 },
};
const env = {
  DB: {
    prepare(sql) {
      return { bind(...params) { return { async first() {
        if (sql.includes("FROM courses")) return COURSES[params[0]] || null;
        return null;
      } }; } };
    },
  },
};

assert.equal(normalizeDeadlineInput({ course_id: "  course-active  " }).course_id, "course-active");
assert.equal(normalizeDeadlineInput({ course_id: "   " }).course_id, null);
assert.match(validateDeadlineInput({ title: "x", due_time: "2026-09-18", all_day: true, course_id: 42 }, true), /course_id/);
assert.equal(await validateDeadlineCourse(env, { course_id: null, subject_id: null }), null);
assert.match(await validateDeadlineCourse(env, { course_id: "course-active", subject_id: null }), /requires subject_id/);
assert.match(await validateDeadlineCourse(env, { course_id: "course-missing", subject_id: "sub-english" }), /does not exist/);
assert.match(await validateDeadlineCourse(env, { course_id: "course-physics", subject_id: "sub-english" }), /must belong/);
assert.equal(await validateDeadlineCourse(env, { course_id: "course-active", subject_id: "sub-english" }), null);
assert.equal(await validateDeadlineCourse(env, { course_id: " course-active ", subject_id: " sub-english " }), null);
assert.equal(await validateDeadlineCourse(env, { course_id: "course-retired", subject_id: "sub-english" }), null);

console.log("deadline course unit tests passed");

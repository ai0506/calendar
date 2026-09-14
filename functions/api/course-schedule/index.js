import { ok, error } from "../../_lib/response.js";
import { listCourseSchedule } from "../../_lib/course-schedule.js";

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  try {
    return ok(await listCourseSchedule(context.env, from, to));
  } catch (err) {
    return error("validation_error", err.message, 400);
  }
}

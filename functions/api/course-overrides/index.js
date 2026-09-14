import { ok, error } from "../../_lib/response.js";
import { createCourseLeave } from "../../_lib/course-schedule.js";

export async function onRequestPost(context) {
  const body = await context.request.json().catch(() => null);
  if (!body || typeof body !== "object") return error("validation_error", "Request body must be a JSON object", 400);
  try {
    return ok(await createCourseLeave(context.env, body), 201);
  } catch (err) {
    return error("validation_error", err.message, 400);
  }
}

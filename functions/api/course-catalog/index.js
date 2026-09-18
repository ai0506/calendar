import { ok } from "../../_lib/response.js";
import { listCourseCatalog } from "../../_lib/course-schedule.js";

// Auth is enforced by the shared /api middleware.
export async function onRequestGet(context) {
  return ok(await listCourseCatalog(context.env));
}

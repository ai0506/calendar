// GET /api/auth/status
// 返回当前认证状态（供前端判断是否需要登录）。

import { isAuthenticated } from "../../_lib/auth.js";
import { ok } from "../../_lib/response.js";

export async function onRequestGet(context) {
  const { request, env } = context;
  const authenticated = await isAuthenticated(request, env);
  return ok({ authenticated });
}

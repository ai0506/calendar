// 全局中间件：保护 /api/* （登录/登出/状态 端点除外）
// 接受有效的会话 Cookie 或 Bearer Token（两条路径见 _lib/auth.js）。

import { isAuthenticated } from "./_lib/auth.js";
import { error } from "./_lib/response.js";

// 无需认证即可访问的端点
const PUBLIC_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/status",
]);

export async function onRequest(context) {
  const { request, env, next } = context;
  const path = new URL(request.url).pathname;

  // 非 API 路径（静态资源）不拦截
  if (!path.startsWith("/api/")) return next();

  // 公开端点放行
  if (PUBLIC_PATHS.has(path)) return next();

  // 其余 API 需认证
  if (!(await isAuthenticated(request, env))) {
    return error("unauthorized", "Authentication required", 401);
  }
  return next();
}

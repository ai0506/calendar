// POST /api/auth/login  { password }
// 校验私人密码，成功则下发长期有效的 httpOnly 会话 Cookie。

import { createSessionCookie, safeEqual } from "../../_lib/auth.js";
import { ok, error } from "../../_lib/response.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.PASSWORD || !env.SESSION_SECRET) {
    return error("server_error", "Auth not configured", 500);
  }

  const body = await request.json().catch(() => ({}));
  const password = body && body.password;

  if (typeof password !== "string" || !safeEqual(password, env.PASSWORD)) {
    return error("invalid_password", "Invalid password", 401);
  }

  const cookie = await createSessionCookie(env.SESSION_SECRET);
  return ok({ authenticated: true }, 200, { "Set-Cookie": cookie });
}

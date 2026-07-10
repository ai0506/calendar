// POST /api/auth/logout
// 清除会话 Cookie。

import { clearSessionCookie } from "../../_lib/auth.js";
import { ok } from "../../_lib/response.js";

export async function onRequestPost() {
  return ok({ authenticated: false }, 200, {
    "Set-Cookie": clearSessionCookie(),
  });
}

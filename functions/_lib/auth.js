// 认证辅助（Cloudflare Pages Functions / Web Crypto）
//
// 两种概念上分离的机制（见 PROJECT_SPEC §5）：
//   1) 浏览器 -> httpOnly 签名 Cookie（长期有效，约 1 年）
//   2) App / AI Agent -> Authorization: Bearer <API_TOKEN>（Phase 1 单一 token）
//
// 会话失效策略：会话 Cookie 用 SESSION_SECRET 做 HMAC 签名；更换 SESSION_SECRET
// 即可让所有已签发的 Cookie 立即失效（签名校验不通过），无需服务端存储会话。

const COOKIE_NAME = "session";
// 约 1 年（秒）。私人单用户日历，无需短时过期。
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

// --- 基础工具 -------------------------------------------------------------

const encoder = new TextEncoder();

/** 常量时间比较，避免时序侧信道 */
export function safeEqual(a, b) {
  const ab = encoder.encode(String(a));
  const bb = encoder.encode(String(b));
  if (ab.length !== bb.length) return false;
  let r = 0;
  for (let i = 0; i < ab.length; i++) r |= ab[i] ^ bb[i];
  return r === 0;
}

function base64urlEncode(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return base64urlEncode(new Uint8Array(sig));
}

// --- Cookie 解析 ----------------------------------------------------------

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

// --- 会话 Cookie ----------------------------------------------------------

// Cookie 值格式：  v1.<exp>.<sig>
//   exp = 过期时间（unix 秒）
//   sig = HMAC_SHA256("v1.<exp>", SESSION_SECRET)

function isLocalhostRequest(request) {
  const hostname = new URL(request.url).hostname;
  // 10.0.2.2 is the Android Emulator's loopback route to the host machine.
  // Treat it as local so HTTP-only development does not receive a Secure cookie.
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "10.0.2.2";
}

/** 生成 Set-Cookie 头字符串（登录成功时使用） */
export async function createSessionCookie(secret, request) {
  const exp = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE;
  const payload = `v1.${exp}`;
  const sig = await hmac(payload, secret);
  const value = `${payload}.${sig}`;
  const secure = request && isLocalhostRequest(request) ? "" : " Secure;";
  return (
    `${COOKIE_NAME}=${value}; Path=/; HttpOnly;${secure} SameSite=Lax; ` +
    `Max-Age=${COOKIE_MAX_AGE}`
  );
}

/** 清除会话 Cookie（登出时使用） */
export function clearSessionCookie(request) {
  const secure = request && isLocalhostRequest(request) ? "" : " Secure;";
  return `${COOKIE_NAME}=; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=0`;
}

/** 校验请求携带的会话 Cookie 是否有效 */
export async function verifySessionCookie(request, secret) {
  const value = getCookie(request, COOKIE_NAME);
  if (!value) return false;
  const idx = value.lastIndexOf(".");
  if (idx < 0) return false;
  const payload = value.slice(0, idx); // v1.<exp>
  const sig = value.slice(idx + 1);
  const parts = payload.split(".");
  if (parts.length !== 2 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmac(payload, secret);
  return safeEqual(sig, expected);
}

// --- Bearer Token ---------------------------------------------------------

/** 校验 Authorization: Bearer <API_TOKEN> */
export function verifyBearerToken(request, apiToken) {
  if (!apiToken) return false;
  const header = request.headers.get("Authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return false;
  return safeEqual(m[1], apiToken);
}

// --- 统一鉴权入口 ---------------------------------------------------------

/** 浏览器 Cookie 或 App/Agent Bearer Token 任一有效即通过 */
export async function isAuthenticated(request, env) {
  if (verifyBearerToken(request, env.API_TOKEN)) return true;
  if (await verifySessionCookie(request, env.SESSION_SECRET)) return true;
  return false;
}

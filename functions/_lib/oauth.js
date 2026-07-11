// OAuth 2.1 / PKCE 辅助（Cloudflare Pages Functions / Web Crypto）
//
// 设计：
//   * access_token 无状态：`at1.<b64url(payload)>.<sig>`，sig = HMAC_SHA256 签名，
//     密钥复用 SESSION_SECRET。校验只需验签 + 查过期 + 比对 aud，无需查库。
//   * 授权码 / 刷新令牌入库（见 migration 0006），支持单次使用 / 过期 / 轮换。
//   * 复用 _lib/auth.js 的 safeEqual 做常量时间比较。
//
// 不修改现有 REST 认证；本模块仅供 /oauth/* 与 /mcp 使用。

import { safeEqual } from "./auth.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const ACCESS_TOKEN_TTL = 3600;             // access token 有效期（秒）：1 小时
export const REFRESH_TOKEN_TTL = 365 * 24 * 3600; // refresh token 有效期（秒）：1 年
// 说明：refresh token 每次使用都会轮换并重置有效期，只要连接器保持使用即“永不过期”；
// 设为 1 年是为了即便长期不用也不至于掉线（需要重新授权）。
export const CODE_TTL = 300;                       // 授权码有效期（秒）：5 分钟
export const DEFAULT_SCOPE = "calendar";           // 唯一 scope，允许调用全部工具
export const USER_SUB = "owner";                   // 单用户

// --- 编解码 ---------------------------------------------------------------

export function b64urlFromBytes(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function b64urlFromString(str) {
  return b64urlFromBytes(encoder.encode(str));
}
export function stringFromB64url(str) {
  return decoder.decode(b64urlToBytes(str));
}

// --- 哈希 / 签名 -----------------------------------------------------------

async function sha256Bytes(input) {
  const data = typeof input === "string" ? encoder.encode(input) : input;
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

/** SHA-256 → base64url（用于 PKCE 校验）。 */
export async function sha256b64url(str) {
  return b64urlFromBytes(await sha256Bytes(str));
}

/** SHA-256 → 十六进制（用于刷新令牌入库哈希）。 */
export async function sha256hex(str) {
  const bytes = await sha256Bytes(str);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmacSign(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return b64urlFromBytes(new Uint8Array(sig));
}

// --- 随机令牌 -------------------------------------------------------------

/** 生成 URL 安全的随机令牌（默认 32 字节熵）。 */
export function randomToken(bytes = 32) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return b64urlFromBytes(buf);
}

// --- access token（无状态签名令牌）---------------------------------------

/**
 * 签发 access token。
 * @param {object} claims { sub, aud, scope }
 * @param {string} secret SESSION_SECRET
 * @param {number} ttl 秒
 */
export async function signAccessToken(claims, secret, ttl = ACCESS_TOKEN_TTL) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { ...claims, iat: now, exp: now + ttl };
  const body = "at1." + b64urlFromString(JSON.stringify(payload));
  const sig = await hmacSign(body, secret);
  return `${body}.${sig}`;
}

/**
 * 校验 access token：验签 + 过期。通过返回 payload，否则 null。
 * 不在此处校验 aud，交由调用方（/mcp）按资源比对。
 */
export async function verifyAccessToken(token, secret) {
  if (typeof token !== "string") return null;
  const idx = token.lastIndexOf(".");
  if (idx < 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!body.startsWith("at1.")) return null;
  const expected = await hmacSign(body, secret);
  if (!safeEqual(sig, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(stringFromB64url(body.slice("at1.".length)));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  return payload;
}

// --- PKCE -----------------------------------------------------------------

/** 校验 PKCE（仅支持 S256）：base64url(SHA256(verifier)) === challenge。 */
export async function verifyPkceS256(codeVerifier, codeChallenge) {
  if (typeof codeVerifier !== "string" || codeVerifier.length < 43) return false;
  const computed = await sha256b64url(codeVerifier);
  return safeEqual(computed, codeChallenge);
}

// --- 资源 / 域名 ----------------------------------------------------------

/** 请求来源 origin，如 https://calendar.ai0506.com。 */
export function originOf(request) {
  return new URL(request.url).origin;
}

/** MCP 资源规范标识：origin + /mcp。 */
export function canonicalResource(request) {
  return originOf(request) + "/mcp";
}

/** 归一化资源标识（去尾部斜杠），用于宽松比对。 */
export function normalizeResource(value) {
  return typeof value === "string" ? value.replace(/\/+$/, "") : value;
}

// --- 通用 CORS（元数据 / 注册 / token 端点）------------------------------

export const OAUTH_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...OAUTH_CORS,
      ...extraHeaders,
    },
  });
}

/** OAuth 错误 JSON（RFC 6749 §5.2）。 */
export function oauthError(error, description, status = 400) {
  return jsonResponse({ error, error_description: description }, status);
}

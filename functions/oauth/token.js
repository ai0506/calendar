// POST /oauth/token  —— 令牌端点 (OAuth 2.1)
//
// 支持两种 grant：
//   authorization_code：校验码（单次/未过期/绑定 client+redirect+PKCE）→ 发 access + refresh
//   refresh_token：校验刷新令牌（未过期/属该 client）→ 轮换 → 发新的 access + refresh
//
// public client：不校验 client secret，改由 PKCE 保证。
// access token 无状态签名（aud=resource），refresh token 存哈希入库、轮换。

import { queryOne, run } from "../_lib/db.js";
import { safeEqual } from "../_lib/auth.js";
import {
  signAccessToken,
  verifyPkceS256,
  randomToken,
  sha256hex,
  jsonResponse,
  oauthError,
  OAUTH_CORS,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  DEFAULT_SCOPE,
  USER_SUB,
} from "../_lib/oauth.js";

// 解析 body：优先 form-urlencoded（OAuth 标准），兼容 JSON
async function parseBody(request) {
  const ct = request.headers.get("Content-Type") || "";
  if (ct.includes("application/json")) {
    const j = await request.json().catch(() => ({}));
    return new Map(Object.entries(j || {}));
  }
  const form = await request.formData().catch(() => null);
  if (form) return form;
  return new Map();
}
const get = (b, k) => (b instanceof Map ? b.get(k) : b.get(k)) || "";

async function issueTokens(env, request, { clientId, resource, scope, userSub }) {
  const accessToken = await signAccessToken(
    { sub: userSub, aud: resource, scope, client_id: clientId },
    env.SESSION_SECRET,
    ACCESS_TOKEN_TTL,
  );

  const refreshToken = randomToken(32);
  const refreshHash = await sha256hex(refreshToken);
  const now = Math.floor(Date.now() / 1000);
  await run(
    env.DB,
    `INSERT INTO oauth_refresh_tokens (token_hash, client_id, resource, scope, user_sub, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [refreshHash, clientId, resource, scope, userSub, now + REFRESH_TOKEN_TTL, new Date().toISOString()],
  );

  return jsonResponse({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
    scope,
  });
}

async function handleAuthorizationCode(env, request, body) {
  const code = get(body, "code");
  const redirectUri = get(body, "redirect_uri");
  const clientId = get(body, "client_id");
  const codeVerifier = get(body, "code_verifier");

  if (!code || !redirectUri || !clientId || !codeVerifier) {
    return oauthError("invalid_request", "code, redirect_uri, client_id, code_verifier are required");
  }

  const row = await queryOne(env.DB, "SELECT * FROM oauth_codes WHERE code = ?", [code]);
  if (!row) return oauthError("invalid_grant", "Unknown authorization code");

  const now = Math.floor(Date.now() / 1000);
  // 单次使用：原子置 used=1；若已用或不存在则失败（防重放）
  const claim = await run(env.DB, "UPDATE oauth_codes SET used = 1 WHERE code = ? AND used = 0", [code]);
  if (!claim.meta || claim.meta.changes !== 1) {
    return oauthError("invalid_grant", "Authorization code already used");
  }
  if (row.expires_at < now) return oauthError("invalid_grant", "Authorization code expired");
  if (!safeEqual(row.client_id, clientId)) return oauthError("invalid_grant", "client_id mismatch");
  if (!safeEqual(row.redirect_uri, redirectUri)) return oauthError("invalid_grant", "redirect_uri mismatch");

  const pkceOk = await verifyPkceS256(codeVerifier, row.code_challenge);
  if (!pkceOk) return oauthError("invalid_grant", "PKCE verification failed");

  return issueTokens(env, request, {
    clientId,
    resource: row.resource,
    scope: row.scope || DEFAULT_SCOPE,
    userSub: row.user_sub || USER_SUB,
  });
}

async function handleRefreshToken(env, request, body) {
  const refreshToken = get(body, "refresh_token");
  const clientId = get(body, "client_id");
  if (!refreshToken || !clientId) {
    return oauthError("invalid_request", "refresh_token and client_id are required");
  }

  const hash = await sha256hex(refreshToken);
  const row = await queryOne(env.DB, "SELECT * FROM oauth_refresh_tokens WHERE token_hash = ?", [hash]);
  if (!row) return oauthError("invalid_grant", "Unknown refresh token");

  // 轮换：先删旧（若已被并发删除则视为失效，防重放）
  const del = await run(env.DB, "DELETE FROM oauth_refresh_tokens WHERE token_hash = ?", [hash]);
  if (!del.meta || del.meta.changes !== 1) {
    return oauthError("invalid_grant", "Refresh token already used");
  }

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at < now) return oauthError("invalid_grant", "Refresh token expired");
  if (!safeEqual(row.client_id, clientId)) return oauthError("invalid_grant", "client_id mismatch");

  return issueTokens(env, request, {
    clientId,
    resource: row.resource,
    scope: row.scope || DEFAULT_SCOPE,
    userSub: row.user_sub || USER_SUB,
  });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.SESSION_SECRET) {
    return oauthError("server_error", "Auth not configured", 500);
  }
  const body = await parseBody(request);
  const grantType = get(body, "grant_type");

  if (grantType === "authorization_code") return handleAuthorizationCode(env, request, body);
  if (grantType === "refresh_token") return handleRefreshToken(env, request, body);
  return oauthError("unsupported_grant_type", `Unsupported grant_type: ${grantType || "(none)"}`);
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}

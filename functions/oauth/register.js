// POST /oauth/register  —— 动态客户端注册 (RFC 7591)
//
// Claude 等 MCP 客户端首次连接时调用，提交自己的 redirect_uris 等元数据，
// 服务器返回一个 client_id。本服务将客户端视为 public client（PKCE，无 secret）。
//
// 无需认证（DCR 端点开放）。仅接受 https 或 localhost 的 redirect_uri。

import { run } from "../_lib/db.js";
import { randomToken, jsonResponse, oauthError, OAUTH_CORS, DEFAULT_SCOPE } from "../_lib/oauth.js";

function isAllowedRedirectUri(uri) {
  if (typeof uri !== "string") return false;
  let u;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.protocol === "https:") return true;
  // 允许本地回环（部分客户端 / 调试用）
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
  return false;
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return oauthError("server_error", "Database not configured", 500);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return oauthError("invalid_client_metadata", "Request body must be JSON");
  }

  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return oauthError("invalid_redirect_uri", "redirect_uris is required and must be a non-empty array");
  }
  for (const uri of redirectUris) {
    if (!isAllowedRedirectUri(uri)) {
      return oauthError("invalid_redirect_uri", `redirect_uri not allowed: ${uri}`);
    }
  }

  const clientId = randomToken(16);
  const now = new Date().toISOString();
  const grantTypes = Array.isArray(body.grant_types) && body.grant_types.length
    ? body.grant_types
    : ["authorization_code", "refresh_token"];
  const responseTypes = Array.isArray(body.response_types) && body.response_types.length
    ? body.response_types
    : ["code"];
  const clientName = typeof body.client_name === "string" ? body.client_name : null;
  const scope = typeof body.scope === "string" ? body.scope : DEFAULT_SCOPE;

  await run(
    env.DB,
    `INSERT INTO oauth_clients
       (client_id, client_name, redirect_uris, token_endpoint_auth_method,
        grant_types, response_types, scope, created_at)
     VALUES (?, ?, ?, 'none', ?, ?, ?, ?)`,
    [
      clientId,
      clientName,
      JSON.stringify(redirectUris),
      JSON.stringify(grantTypes),
      JSON.stringify(responseTypes),
      scope,
      now,
    ],
  );

  // RFC 7591 §3.2.1 成功响应
  return jsonResponse(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: grantTypes,
      response_types: responseTypes,
      client_name: clientName ?? undefined,
      scope,
    },
    201,
  );
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}

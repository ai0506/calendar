// /.well-known/oauth-authorization-server  (RFC 8414)
//
// 授权服务器元数据。MCP 客户端据此发现 authorize / token / register 端点，
// 以及支持的 PKCE 方法（仅 S256）。

import { originOf, jsonResponse, OAUTH_CORS, DEFAULT_SCOPE } from "../_lib/oauth.js";

export function onRequestGet({ request }) {
  const origin = originOf(request);
  return jsonResponse({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    scopes_supported: [DEFAULT_SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}

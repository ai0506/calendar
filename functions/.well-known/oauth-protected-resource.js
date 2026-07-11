// /.well-known/oauth-protected-resource  (RFC 9728)
//
// 告诉 MCP 客户端：本受保护资源（/mcp）由哪个授权服务器保护。
// Claude 收到 /mcp 的 401（含 WWW-Authenticate 指向本文档）后会来读取此处。

import { originOf, canonicalResource, jsonResponse, OAUTH_CORS, DEFAULT_SCOPE } from "../_lib/oauth.js";

export function onRequestGet({ request }) {
  return jsonResponse({
    resource: canonicalResource(request),
    authorization_servers: [originOf(request)],
    scopes_supported: [DEFAULT_SCOPE],
    bearer_methods_supported: ["header"],
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: OAUTH_CORS });
}

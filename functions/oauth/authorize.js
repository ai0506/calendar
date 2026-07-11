// /oauth/authorize  —— 授权端点 (OAuth 2.1 Authorization Code + PKCE)
//
//   GET  展示登录/授权页（复用本人登录密码作为“同意授权”的凭据）
//   POST 校验密码 → 签发一次性授权码 → 302 重定向回 redirect_uri
//
// 严格校验：client_id 存在、redirect_uri 精确匹配已注册值、response_type=code、
// PKCE code_challenge + S256、state 透传、resource 记录到码上（供 token 端点绑定 aud）。
//
// 安全：redirect_uri / client 非法时 **不重定向**，直接返回错误页（防开放重定向）。
// 其余错误在 redirect_uri 合法时按规范重定向回客户端并带 error 参数。

import { queryOne, run } from "../_lib/db.js";
import { safeEqual } from "../_lib/auth.js";
import {
  randomToken,
  canonicalResource,
  normalizeResource,
  CODE_TTL,
  DEFAULT_SCOPE,
  USER_SUB,
} from "../_lib/oauth.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlPage(body, status = 200) {
  return new Response(
    `<!doctype html><html lang="zh"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>授权 · AI0506 Calendar</title><style>` +
      `body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;` +
      `background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}` +
      `.card{background:#1e293b;padding:32px;border-radius:14px;max-width:380px;width:calc(100% - 32px);box-shadow:0 10px 40px rgba(0,0,0,.4)}` +
      `h1{font-size:18px;margin:0 0 4px}p{color:#94a3b8;font-size:13px;margin:0 0 20px;line-height:1.6}` +
      `label{display:block;font-size:13px;margin-bottom:6px}` +
      `input[type=password]{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e2e8f0;font-size:14px}` +
      `button{margin-top:18px;width:100%;padding:11px;border:0;border-radius:8px;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;cursor:pointer}` +
      `button:hover{background:#2563eb}.err{color:#f87171;font-size:13px;margin-bottom:14px}` +
      `.app{color:#e2e8f0;font-weight:600}</style></head><body>${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

function errorPage(message, status = 400) {
  return htmlPage(`<div class="card"><h1>无法完成授权</h1><p class="err">${escapeHtml(message)}</p></div>`, status);
}

// 读取并校验客户端 + redirect_uri。返回 { client } 或 { error }（error 为面向用户的字符串）。
async function loadClientAndRedirect(env, clientId, redirectUri) {
  if (!clientId) return { error: "缺少 client_id" };
  const client = await queryOne(env.DB, "SELECT * FROM oauth_clients WHERE client_id = ?", [clientId]);
  if (!client) return { error: "未知的 client_id（客户端未注册）" };
  let uris;
  try {
    uris = JSON.parse(client.redirect_uris);
  } catch {
    uris = [];
  }
  if (!redirectUri || !uris.includes(redirectUri)) {
    return { error: "redirect_uri 与注册值不匹配" };
  }
  return { client };
}

function loginForm(params, errorMsg) {
  const hidden = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource", "response_type"]
    .map((k) => `<input type="hidden" name="${k}" value="${escapeHtml(params[k] ?? "")}">`)
    .join("");
  const appName = params.client_name ? escapeHtml(params.client_name) : "一个应用";
  const err = errorMsg ? `<p class="err">${escapeHtml(errorMsg)}</p>` : "";
  return htmlPage(
    `<form class="card" method="POST" action="/oauth/authorize">` +
      `<h1>授权访问日历</h1>` +
      `<p><span class="app">${appName}</span> 请求读取和管理你的日历事件。输入你的登录密码以授权。</p>` +
      err +
      `<label for="pw">登录密码</label>` +
      `<input id="pw" type="password" name="password" autocomplete="current-password" autofocus required>` +
      hidden +
      `<button type="submit">授权</button>` +
      `</form>`,
  );
}

// 收集 authorize 参数（GET query 或 POST form）
function collectParams(src, clientName) {
  return {
    response_type: src.get("response_type") || "",
    client_id: src.get("client_id") || "",
    redirect_uri: src.get("redirect_uri") || "",
    state: src.get("state") || "",
    code_challenge: src.get("code_challenge") || "",
    code_challenge_method: src.get("code_challenge_method") || "",
    scope: src.get("scope") || DEFAULT_SCOPE,
    resource: src.get("resource") || "",
    client_name: clientName || "",
  };
}

// 校验除 client/redirect 外的其余参数。返回 error code 字符串或 null。
function validateAuthParams(p) {
  if (p.response_type !== "code") return "unsupported_response_type";
  if (!p.code_challenge) return "invalid_request:missing code_challenge";
  if (p.code_challenge_method !== "S256") return "invalid_request:code_challenge_method must be S256";
  return null;
}

function redirectWithError(redirectUri, state, error, description) {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  if (description) u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  return Response.redirect(u.toString(), 302);
}

// ---- GET：展示登录页 ----
export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.PASSWORD || !env.SESSION_SECRET) {
    return errorPage("授权服务未正确配置（缺少 DB / PASSWORD / SESSION_SECRET）", 500);
  }
  const url = new URL(request.url);
  const p = collectParams(url.searchParams);

  const { client, error } = await loadClientAndRedirect(env, p.client_id, p.redirect_uri);
  if (error) return errorPage(error); // 不重定向

  // 其余参数错误：redirect_uri 合法，按规范重定向回客户端
  const paramErr = validateAuthParams(p);
  if (paramErr) {
    const [code, desc] = paramErr.split(":");
    return redirectWithError(p.redirect_uri, p.state, code, desc);
  }

  let clientName = null;
  try {
    clientName = client.client_name;
  } catch { /* ignore */ }
  return loginForm({ ...p, client_name: clientName });
}

// ---- POST：校验密码并签发授权码 ----
export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.PASSWORD || !env.SESSION_SECRET) {
    return errorPage("授权服务未正确配置", 500);
  }
  const form = await request.formData();
  const p = collectParams(form);
  const password = form.get("password") || "";

  const { client, error } = await loadClientAndRedirect(env, p.client_id, p.redirect_uri);
  if (error) return errorPage(error); // 不重定向

  const paramErr = validateAuthParams(p);
  if (paramErr) {
    const [code, desc] = paramErr.split(":");
    return redirectWithError(p.redirect_uri, p.state, code, desc);
  }

  // 校验密码（复用本人登录密码）。失败则重新展示登录页。
  if (typeof password !== "string" || !safeEqual(password, env.PASSWORD)) {
    let clientName = null;
    try { clientName = client.client_name; } catch { /* ignore */ }
    return loginForm({ ...p, client_name: clientName }, "密码错误，请重试");
  }

  // resource 绑定：客户端提供则用之，否则默认本 MCP 资源
  const resource = normalizeResource(p.resource) || canonicalResource(request);

  // 生成一次性授权码
  const code = randomToken(32);
  const now = Math.floor(Date.now() / 1000);
  await run(
    env.DB,
    `INSERT INTO oauth_codes
       (code, client_id, redirect_uri, code_challenge, code_challenge_method,
        resource, scope, user_sub, expires_at, used, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      code,
      p.client_id,
      p.redirect_uri,
      p.code_challenge,
      p.code_challenge_method,
      resource,
      p.scope || DEFAULT_SCOPE,
      USER_SUB,
      now + CODE_TTL,
      new Date().toISOString(),
    ],
  );

  const u = new URL(p.redirect_uri);
  u.searchParams.set("code", code);
  if (p.state) u.searchParams.set("state", p.state);
  return Response.redirect(u.toString(), 302);
}

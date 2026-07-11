// /mcp — MCP 服务器端点（OAuth 版）
//
// 传输方式：MCP "Streamable HTTP"。客户端（Claude / ChatGPT / MCP Inspector）
// 向本端点 POST 一段 JSON-RPC 2.0 消息，服务器以单条 JSON 响应返回。
//
// 鉴权（每个请求都要求）：
//   1) OAuth 2.1 access token：Authorization: Bearer <access_token>
//      通过 /oauth/* 授权流程签发；校验签名 + 过期 + aud（资源）。
//      任一有效 token 均可调用全部 5 个工具。
//   2) 本地调试旁路：若设置了环境变量 MCP_WRITE_TOKEN 且 Bearer 与之相等，也放行。
//      **生产环境不要设置 MCP_WRITE_TOKEN**——不设置则仅 OAuth 可用。
//
// 未携带有效 token → 401 + WWW-Authenticate 指向受保护资源元数据，
// 触发 Claude 走 OAuth 授权。
//
// 本端点不在 /api/* 下，_middleware.js 不拦截，不影响现有 REST API 认证。
// 复用 _lib/ 的 db / events / auth / oauth 逻辑，不修改现有 REST API。

import { queryAll, queryOne, run } from "../_lib/db.js";
import { safeEqual } from "../_lib/auth.js";
import {
  verifyAccessToken,
  canonicalResource,
  normalizeResource,
  originOf,
} from "../_lib/oauth.js";
import {
  isValidIso,
  rowToEvent,
  validateEventInput,
  validateEventTemporalOrder,
  nowIso,
  toIntBool,
} from "../_lib/events.js";

// 与客户端协商的协议版本。若客户端请求了具体版本则回显，否则用此默认值。
const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

// 本地调试用的宽松 CORS（Inspector 可能通过浏览器发起）。
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version",
};

// 可被 update_event 更新的字段（与 PUT /api/events/:id 保持一致；id/created_at 不可改）
const UPDATABLE = [
  "title",
  "description",
  "start_time",
  "end_time",
  "all_day",
  "category",
  "color",
  "group_title",
  "source",
  "external_id",
];

// --- 工具定义 -------------------------------------------------------------

const EVENT_WRITE_PROPERTIES = {
  title: { type: "string", description: "标题" },
  description: { type: "string", description: "描述（可选）" },
  start_time: {
    type: "string",
    description: "开始时间，ISO 8601 带时区偏移，如 2026-07-14T19:00:00+08:00",
  },
  end_time: { type: "string", description: "结束时间，ISO 8601 带时区偏移（可选）" },
  all_day: { type: "boolean", description: "是否全天事件（可选，默认 false）" },
  category: { type: "string", description: "分类名，如 Physics（可选）" },
  color: { type: "string", description: "颜色 hex，如 #3b82f6（可选）" },
  group_title: { type: "string", description: "分组标题（可选）" },
};

const TOOLS = [
  {
    name: "list_events",
    description:
      "【只读】列出日历事件（排除已删除）。可按时间范围 from/to（ISO 8601 带时区偏移，" +
      "过滤 start_time）和分类名 category 过滤，按开始时间升序返回。",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "起始时间，ISO 8601 带时区偏移。过滤 start_time >= from。",
        },
        to: {
          type: "string",
          description: "结束时间，ISO 8601 带时区偏移。过滤 start_time <= to。",
        },
        category: { type: "string", description: "按分类名精确过滤，如 Physics。" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_categories",
    description: "【只读】列出全部分类，按 sort_order、name 升序返回。",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "create_event",
    description:
      "【需写权限】创建一个事件。id / created_at / updated_at 由服务器生成。" +
      "时间原样保留提交的时区偏移，服务器不做 UTC 转换。",
    annotations: { readOnlyHint: false },
    inputSchema: {
      type: "object",
      properties: EVENT_WRITE_PROPERTIES,
      required: ["title", "start_time"],
      additionalProperties: false,
    },
  },
  {
    name: "update_event",
    description:
      "【需写权限】更新指定 id 的事件（仅更新提供的字段）。若改了 category 且未显式指定 color，" +
      "会自动继承该分类颜色。updated_at 由服务器刷新。",
    annotations: { readOnlyHint: false },
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "事件 id" }, ...EVENT_WRITE_PROPERTIES },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_event",
    description: "【需写权限】软删除指定 id 的事件（设置 deleted_at，不物理删除）。",
    annotations: { readOnlyHint: false, destructiveHint: true },
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "事件 id" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

// --- 只读工具实现 ----------------------------------------------------------

// 复用与 GET /api/events 相同的查询逻辑（直接查 D1，不经过 HTTP）。
async function runListEvents(env, args = {}) {
  const { from, to, category } = args;
  if (from !== undefined && !isValidIso(from)) throw new Error("from 必须是 ISO 8601（带时区偏移）");
  if (to !== undefined && !isValidIso(to)) throw new Error("to 必须是 ISO 8601（带时区偏移）");

  let sql = "SELECT * FROM events WHERE deleted_at IS NULL";
  const params = [];
  if (from) { sql += " AND start_time >= ?"; params.push(from); }
  if (to) { sql += " AND start_time <= ?"; params.push(to); }
  if (category) { sql += " AND category = ?"; params.push(category); }
  sql += " ORDER BY start_time ASC";

  const rows = await queryAll(env.DB, sql, params);
  return rows.map(rowToEvent);
}

// 复用与 GET /api/categories 相同的查询逻辑。
async function runListCategories(env) {
  return queryAll(env.DB, "SELECT * FROM categories ORDER BY sort_order ASC, name ASC");
}

// --- 写入工具实现（镜像 REST handler 逻辑）--------------------------------

async function getActiveEvent(env, id) {
  return queryOne(env.DB, "SELECT * FROM events WHERE id = ? AND deleted_at IS NULL", [id]);
}

// 对应 POST /api/events
async function runCreateEvent(env, args = {}) {
  const msg = validateEventInput(args, true);
  if (msg) throw new Error(msg);
  const temporalMsg = validateEventTemporalOrder(args);
  if (temporalMsg) throw new Error(temporalMsg);

  const now = nowIso();
  const event = {
    id: crypto.randomUUID(),
    title: args.title,
    description: args.description ?? null,
    start_time: args.start_time,
    end_time: args.end_time ?? null,
    all_day: toIntBool(args.all_day),
    category: args.category ?? null,
    color: args.color ?? null,
    group_title: args.group_title ?? null,
    source: args.source ?? "mcp",
    external_id: args.external_id ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await run(
    env.DB,
    `INSERT INTO events
       (id, title, description, start_time, end_time, all_day, category, color,
        group_title, source, external_id, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      event.id, event.title, event.description, event.start_time, event.end_time,
      event.all_day, event.category, event.color, event.group_title, event.source,
      event.external_id, event.created_at, event.updated_at, event.deleted_at,
    ],
  );

  return rowToEvent(event);
}

// 对应 PUT /api/events/:id
async function runUpdateEvent(env, args = {}) {
  const { id } = args;
  if (typeof id !== "string" || id === "") throw new Error("id is required");

  const existing = await getActiveEvent(env, id);
  if (!existing) throw new Error("Event not found");

  const body = { ...args };
  delete body.id;

  const msg = validateEventInput(body, false);
  if (msg) throw new Error(msg);
  const temporalMsg = validateEventTemporalOrder({ ...existing, ...body });
  if (temporalMsg) throw new Error(temporalMsg);

  // 仅改 category 而未显式指定 color 时，继承该分类颜色（与 REST 一致）
  if (
    body.category !== undefined &&
    (body.color === undefined || String(body.color).toLowerCase() === "default") &&
    body.category !== existing.category
  ) {
    const category = await queryOne(env.DB, "SELECT color FROM categories WHERE name = ?", [body.category]);
    if (category?.color) body.color = category.color;
  }

  const sets = [];
  const values = [];
  for (const f of UPDATABLE) {
    if (body[f] === undefined) continue;
    sets.push(`${f} = ?`);
    values.push(f === "all_day" ? toIntBool(body[f]) : body[f]);
  }

  const now = nowIso();
  sets.push("updated_at = ?");
  values.push(now);
  values.push(id);

  await run(
    env.DB,
    `UPDATE events SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
    values,
  );

  return rowToEvent(await getActiveEvent(env, id));
}

// 对应 DELETE /api/events/:id （软删除）
async function runDeleteEvent(env, args = {}) {
  const { id } = args;
  if (typeof id !== "string" || id === "") throw new Error("id is required");

  const now = nowIso();
  const result = await run(
    env.DB,
    "UPDATE events SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL",
    [now, now, id],
  );
  if (!result.meta || result.meta.changes === 0) throw new Error("Event not found");
  return { id, deleted: true };
}

// --- 鉴权 -----------------------------------------------------------------

function extractBearer(request) {
  const header = request.headers.get("Authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

// 校验请求是否携带有效凭据。通过返回 true。
//   - OAuth access token：验签 + 过期 + aud 必须等于本资源（canonicalResource）
//   - 本地调试旁路：MCP_WRITE_TOKEN 完全匹配（生产不应设置）
async function authenticate(request, env) {
  const token = extractBearer(request);
  if (!token) return false;

  // 本地调试旁路
  if (env.MCP_WRITE_TOKEN && safeEqual(token, env.MCP_WRITE_TOKEN)) return true;

  // OAuth access token
  if (!env.SESSION_SECRET) return false;
  const payload = await verifyAccessToken(token, env.SESSION_SECRET);
  if (!payload) return false;
  // audience 绑定：token 的 aud 必须指向本 MCP 资源
  if (normalizeResource(payload.aud) !== normalizeResource(canonicalResource(request))) return false;
  return true;
}

// 401：附带 WWW-Authenticate，指向受保护资源元数据，触发客户端走 OAuth。
function unauthorized(request) {
  const metadataUrl = `${originOf(request)}/.well-known/oauth-protected-resource`;
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "WWW-Authenticate": `Bearer resource_metadata="${metadataUrl}"`,
        ...CORS_HEADERS,
      },
    },
  );
}

// --- 工具分发 -------------------------------------------------------------

async function callTool(env, name, args) {
  switch (name) {
    case "list_events": return runListEvents(env, args);
    case "list_categories": return runListCategories(env);
    case "create_event": return runCreateEvent(env, args);
    case "update_event": return runUpdateEvent(env, args);
    case "delete_event": return runDeleteEvent(env, args);
    default: throw new Error(`未知工具：${name}`);
  }
}

// --- JSON-RPC 分发 --------------------------------------------------------

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
// 工具级错误（用 isError 标记内容，而非协议级 error）
function toolError(id, message) {
  return rpcResult(id, { content: [{ type: "text", text: message }], isError: true });
}

async function handleMessage(request, env, msg) {
  const isNotification = msg.id === undefined || msg.id === null;
  const { method, params, id } = msg;

  try {
    switch (method) {
      case "initialize": {
        const requested = params?.protocolVersion;
        return rpcResult(id, {
          protocolVersion: typeof requested === "string" ? requested : DEFAULT_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "ai0506-calendar", version: "0.1.0" },
        });
      }

      case "notifications/initialized":
      case "notifications/cancelled":
        return null;

      case "ping":
        return rpcResult(id, {});

      case "tools/list":
        return rpcResult(id, { tools: TOOLS });

      case "tools/call": {
        const name = params?.name;
        const args = params?.arguments ?? {};
        try {
          const data = await callTool(env, name, args);
          return rpcResult(id, { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });
        } catch (toolErr) {
          return toolError(id, `工具执行失败：${toolErr.message}`);
        }
      }

      default:
        if (isNotification) return null;
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    if (isNotification) return null;
    return rpcError(id ?? null, -32603, `Internal error: ${err.message}`);
  }
}

// --- HTTP 入口 ------------------------------------------------------------

export async function onRequestPost(context) {
  const { request, env } = context;

  // 所有 /mcp 请求都需有效凭据（含 initialize）。未认证 → 401 触发 OAuth。
  if (!(await authenticate(request, env))) {
    return unauthorized(request);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      400,
    );
  }

  if (Array.isArray(payload)) {
    const responses = [];
    for (const msg of payload) {
      const r = await handleMessage(request, env, msg);
      if (r) responses.push(r);
    }
    if (responses.length === 0) return new Response(null, { status: 202, headers: CORS_HEADERS });
    return jsonResponse(responses, 200);
  }

  const response = await handleMessage(request, env, payload);
  if (response === null) return new Response(null, { status: 202, headers: CORS_HEADERS });
  return jsonResponse(response, 200);
}

// GET 用于 SSE 长连接；本版本不支持服务器主动推送。
export function onRequestGet() {
  return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
}

// CORS 预检
export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS_HEADERS },
  });
}

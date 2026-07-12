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

import { queryAll, queryOne, run, batch } from "../_lib/db.js";
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
import {
  generateInstances,
  validateRecurringRequest,
  rowToSeries,
  seriesRowToRequest,
  mergeSeriesPatch,
  isValidDateKey,
  dateDelta,
  shiftDate,
} from "../_lib/recurrence.js";
import {
  seriesFromRequest,
  insertSeriesStatement,
  insertInstanceStatement,
} from "../_lib/series.js";
import {
  activeDeadline,
  deadlineDateParam,
  deadlineFields,
  normalizeDeadlineInput,
  parseBooleanParam,
  rowToDeadline,
  validateDeadlineInput,
} from "../_lib/deadlines.js";

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
  color: {
    type: "string",
    description:
      "颜色 hex（如 #3b82f6），或字符串 \"default\" 表示跟随所属分类的颜色（可选）。" +
      "不确定用什么颜色时优先用 \"default\"，会自动采用 category 的颜色。",
  },
  group_title: { type: "string", description: "分组标题（可选）" },
};

const DEADLINE_WRITE_PROPERTIES = {
  title: { type: "string", description: "截止事项标题" },
  description: { type: "string", description: "描述（可选）" },
  due_time: { type: "string", description: "截止日期 YYYY-MM-DD，或带时区的 ISO 8601 时间" },
  all_day: { type: "boolean", description: "是否全天截止事项；全天时 due_time 必须为 YYYY-MM-DD" },
  category: { type: "string", description: "分类名（可选）" },
  color: { type: "string", description: "六位 hex 颜色、default 或 null（可选）" },
  group_title: { type: "string", description: "分组标题（可选）" },
  priority: { type: "string", enum: ["high", "default", "low"], description: "重要程度，默认 default" },
  source: { type: "string", description: "来源（创建时可选）" },
  external_id: { type: "string", description: "外部唯一标识（创建时可选）" },
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
    name: "list_deadlines",
    description: "【只读】列出单次截止事项。未指定日期时返回当前上海时间起未来 30 天；可按分类和完成状态过滤。",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: {
      from: { type: "string", description: "起始日期 YYYY-MM-DD（可选）" },
      to: { type: "string", description: "结束日期 YYYY-MM-DD（可选）" },
      category: { type: "string", description: "分类名（可选）" },
      include_completed: { type: "boolean", description: "是否包含已完成项，默认 true" },
    }, additionalProperties: false },
  },
  {
    name: "create_deadline",
    description: "【需写权限】创建单次截止事项。priority 仅支持 high/default/low；暂不支持重复截止事项。",
    annotations: { readOnlyHint: false },
    inputSchema: { type: "object", properties: DEADLINE_WRITE_PROPERTIES, required: ["title", "due_time"], additionalProperties: false },
  },
  {
    name: "get_deadline",
    description: "【只读】按 id 读取单个活动截止事项。",
    annotations: { readOnlyHint: true },
    inputSchema: { type: "object", properties: { id: { type: "string", description: "截止事项 id" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "update_deadline",
    description: "【需写权限】修改截止事项；source 和 external_id 创建后不可修改，只传需要修改的字段。",
    annotations: { readOnlyHint: false },
    inputSchema: { type: "object", properties: { id: { type: "string", description: "截止事项 id" }, ...DEADLINE_WRITE_PROPERTIES }, required: ["id"], additionalProperties: false },
  },
  {
    name: "delete_deadline",
    description: "【需写权限】软删除一个截止事项。",
    annotations: { readOnlyHint: false, destructiveHint: true },
    inputSchema: { type: "object", properties: { id: { type: "string", description: "截止事项 id" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "complete_deadline",
    description: "【需写权限】将截止事项标记为已完成；重复调用幂等。",
    annotations: { readOnlyHint: false },
    inputSchema: { type: "object", properties: { id: { type: "string", description: "截止事项 id" } }, required: ["id"], additionalProperties: false },
  },
  {
    name: "reopen_deadline",
    description: "【需写权限】重新打开已完成的截止事项；重复调用幂等。",
    annotations: { readOnlyHint: false },
    inputSchema: { type: "object", properties: { id: { type: "string", description: "截止事项 id" } }, required: ["id"], additionalProperties: false },
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
  {
    name: "create_event_series",
    description:
      "【需写权限】创建一个重复事件系列，并生成全部实例。用于“每天/每周/每月/每年重复”的日程。" +
      "必须提供 end_date 或 occurrence_count 之一来界定范围（最多 366 个实例）。" +
      "weekly 频率必须提供 weekdays（0=周日…6=周六）。",
    annotations: { readOnlyHint: false },
    inputSchema: {
      type: "object",
      properties: {
        ...EVENT_WRITE_PROPERTIES,
        frequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"], description: "重复频率" },
        weekdays: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 6 },
          description: "weekly 时必填：星期几重复，0=周日,1=周一,…,6=周六。如周二四六=[2,4,6]",
        },
        start_date: { type: "string", description: "起始日期 YYYY-MM-DD（可选，默认取 start_time 的日期）" },
        end_date: { type: "string", description: "结束日期 YYYY-MM-DD（含当天）。与 occurrence_count 二选一" },
        occurrence_count: { type: "integer", description: "重复次数（正整数，≤366）。与 end_date 二选一" },
      },
      required: ["title", "start_time", "frequency"],
      additionalProperties: false,
    },
  },
  {
    name: "get_event_series",
    description: "【只读】获取指定 id 的重复系列：规则、当前未删除实例、以及已登记的跳过项(exceptions)。",
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "系列 id（series_id）" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "update_event_series",
    description:
      "【需写权限】修改整个重复系列的规则（仅传要改的字段），会按新规则**重新生成全部实例**。" +
      "⚠️ 影响面大：之前对单个实例的单独修改会丢失。" +
      "👉 优先考虑更精细的做法：只想改“从某天起”的规则 → 用 split_series 先切成两段再改新段；" +
      "只想去掉/挪动某一次 → 用 skip_occurrence。仅当要整体改动整个系列时才用本工具。",
    annotations: { readOnlyHint: false },
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "系列 id（series_id）" },
        ...EVENT_WRITE_PROPERTIES,
        frequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"], description: "重复频率" },
        weekdays: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 6 },
          description: "weekly 时的星期几，0=周日…6=周六",
        },
        start_date: { type: "string", description: "起始日期 YYYY-MM-DD" },
        end_date: { type: "string", description: "结束日期 YYYY-MM-DD" },
        occurrence_count: { type: "integer", description: "重复次数（≤366）" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_event_series",
    description:
      "【需写权限】软删除**整个**重复系列及其全部未删除实例。" +
      "👉 若只想去掉其中一次，别用这个——改用 skip_occurrence（保留系列，只跳过那一次）。",
    annotations: { readOnlyHint: false, destructiveHint: true },
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "系列 id（series_id）" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "skip_occurrence",
    description:
      "【需写权限｜推荐】跳过重复系列中的**某一次**（不影响其余）。用于“这周二那次取消/请假”。" +
      "只登记跳过，不创建替代事件；如需改期，跳过后再用 create_event 单独建一个普通事件。",
    annotations: { readOnlyHint: false },
    inputSchema: {
      type: "object",
      properties: {
        series_id: { type: "string", description: "系列 id" },
        original_start_time: {
          type: "string",
          description: "要跳过的那一次的原始开始时间（ISO 8601 带时区偏移，须与系列生成的实例时间一致）",
        },
      },
      required: ["series_id", "original_start_time"],
      additionalProperties: false,
    },
  },
  {
    name: "restore_occurrence",
    description: "【需写权限】撤销之前的跳过，恢复重复系列中某一次的实例。与 skip_occurrence 相反。",
    annotations: { readOnlyHint: false },
    inputSchema: {
      type: "object",
      properties: {
        series_id: { type: "string", description: "系列 id" },
        original_start_time: { type: "string", description: "此前被跳过的那一次的原始开始时间（ISO 8601）" },
      },
      required: ["series_id", "original_start_time"],
      additionalProperties: false,
    },
  },
  {
    name: "split_series",
    description:
      "【需写权限｜推荐】把一个重复系列从 split_date 起切成前后两段（split_date 归入新段）。" +
      "用于“从某天起改变重复规则/时间/分类”而**不影响之前的历史**：切分后对返回的 new_series_id " +
      "调用 update_event_series 修改新段即可。仅支持带 end_date 且无 occurrence_count 的系列。",
    annotations: { readOnlyHint: false },
    inputSchema: {
      type: "object",
      properties: {
        series_id: { type: "string", description: "要切分的系列 id" },
        split_date: { type: "string", description: "切分日期 YYYY-MM-DD，该日起属于新段（须在系列范围内）" },
      },
      required: ["series_id", "split_date"],
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

function shanghaiDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date);
}

async function runListDeadlines(env, args = {}) {
  let from = deadlineDateParam(args.from); let to = deadlineDateParam(args.to);
  if (from === undefined || to === undefined) throw new Error("from/to must be valid YYYY-MM-DD dates");
  if (from && to && to < from) throw new Error("to must not be before from");
  if (args.category !== undefined && (typeof args.category !== "string" || args.category.trim() === "")) throw new Error("category must be a non-empty string");
  const includeCompleted = args.include_completed === undefined ? true : parseBooleanParam(args.include_completed, true);
  if (includeCompleted === null) throw new Error("include_completed must be true or false");
  if (!from && !to) { from = shanghaiDateKey(); to = shanghaiDateKey(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)); }
  let sql = "SELECT * FROM deadlines WHERE deleted_at IS NULL"; const params = [];
  if (from) { sql += " AND substr(due_time, 1, 10) >= ?"; params.push(from); }
  if (to) { sql += " AND substr(due_time, 1, 10) <= ?"; params.push(to); }
  if (!includeCompleted) sql += " AND completed_at IS NULL";
  if (args.category) { sql += " AND category = ?"; params.push(args.category); }
  sql += " ORDER BY substr(due_time, 1, 10) ASC, CASE WHEN all_day = 1 THEN 0 ELSE 1 END ASC, CASE WHEN all_day = 1 THEN 0 ELSE julianday(due_time) END ASC, id ASC";
  return (await queryAll(env.DB, sql, params)).map(rowToDeadline);
}

async function runCreateDeadline(env, args = {}) {
  const message = validateDeadlineInput(args, true); if (message) throw new Error(message);
  const input = normalizeDeadlineInput(args); const now = nowIso();
  const deadline = { id: crypto.randomUUID(), title: input.title.trim(), description: input.description ?? null, due_time: input.due_time, all_day: input.all_day === 1 ? 1 : 0, category: input.category ?? null, color: input.color ?? null, group_title: input.group_title ?? null, priority: input.priority || "default", source: input.source || "mcp", external_id: input.external_id ?? null, created_at: now, updated_at: now, completed_at: null, deleted_at: null };
  await run(env.DB, "INSERT INTO deadlines (id, title, description, due_time, all_day, category, color, group_title, priority, source, external_id, created_at, updated_at, completed_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", Object.values(deadline));
  return rowToDeadline(deadline);
}

async function runGetDeadline(env, args = {}) {
  if (typeof args.id !== "string" || args.id.trim() === "") throw new Error("id is required");
  const row = await activeDeadline(env, args.id); if (!row) throw new Error("Deadline not found"); return rowToDeadline(row);
}

async function runUpdateDeadline(env, args = {}) {
  if (typeof args.id !== "string" || args.id.trim() === "") throw new Error("id is required");
  const existing = await activeDeadline(env, args.id); if (!existing) throw new Error("Deadline not found");
  if (args.source !== undefined || args.external_id !== undefined) throw new Error("source and external_id cannot be modified");
  const body = { ...args }; delete body.id;
  const message = validateDeadlineInput({ ...existing, ...body }, true); if (message) throw new Error(message);
  const input = normalizeDeadlineInput(body); const sets = []; const values = [];
  for (const field of deadlineFields()) { if (field === "source" || field === "external_id" || input[field] === undefined) continue; sets.push(`${field} = ?`); values.push(field === "all_day" ? input[field] : field === "title" ? input[field].trim() : input[field]); }
  sets.push("updated_at = ?"); values.push(nowIso(), args.id);
  await run(env.DB, `UPDATE deadlines SET ${sets.join(", ")} WHERE id = ? AND deleted_at IS NULL`, values);
  return rowToDeadline(await activeDeadline(env, args.id));
}

async function runDeleteDeadline(env, args = {}) {
  if (typeof args.id !== "string" || args.id.trim() === "") throw new Error("id is required");
  const now = nowIso(); const result = await run(env.DB, "UPDATE deadlines SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL", [now, now, args.id]);
  if (!result.meta || result.meta.changes === 0) throw new Error("Deadline not found"); return { id: args.id, deleted: true };
}

async function runSetDeadlineCompletion(env, args = {}, complete) {
  if (typeof args.id !== "string" || args.id.trim() === "") throw new Error("id is required");
  const timestamp = nowIso();
  if (complete) await run(env.DB, "UPDATE deadlines SET completed_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL AND completed_at IS NULL", [timestamp, timestamp, args.id]);
  else await run(env.DB, "UPDATE deadlines SET completed_at = NULL, updated_at = ? WHERE id = ? AND deleted_at IS NULL AND completed_at IS NOT NULL", [timestamp, args.id]);
  const current = await activeDeadline(env, args.id); if (!current) throw new Error("Deadline not found"); return rowToDeadline(current);
}

// --- 写入工具实现（镜像 REST handler 逻辑）--------------------------------

async function getActiveEvent(env, id) {
  return queryOne(env.DB, "SELECT * FROM events WHERE id = ? AND deleted_at IS NULL", [id]);
}

// 颜色 "default" 语义：跟随所属分类的颜色。
// - color 为具体值 → 原样返回
// - color 为 "default"（忽略大小写）→ 返回该分类的颜色；无分类或查不到则 null
// - color 未提供(undefined) → 原样返回 undefined（由调用方 ?? null 处理）
async function resolveDefaultColor(env, category, color) {
  if (typeof color !== "string" || color.toLowerCase() !== "default") return color;
  if (category) {
    const cat = await queryOne(env.DB, "SELECT color FROM categories WHERE name = ?", [category]);
    if (cat?.color) return cat.color;
  }
  return null;
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
    color: (await resolveDefaultColor(env, args.category ?? null, args.color)) ?? null,
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

  // 显式把颜色设为 "default"（未随分类变更被上面处理时）：跟随有效分类颜色
  if (typeof body.color === "string" && body.color.toLowerCase() === "default") {
    body.color = await resolveDefaultColor(env, body.category ?? existing.category, "default");
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

// --- 重复系列工具（镜像 /api/event-series 逻辑）---------------------------

async function getActiveSeries(env, id) {
  return queryOne(env.DB, "SELECT * FROM event_series WHERE id = ? AND deleted_at IS NULL", [id]);
}

// 从友好的工具参数构造 recurrence 请求体，并补齐派生字段（start_date / monthly_*）。
function buildRecurrenceBody(args) {
  const startTime = args.start_time;
  if (typeof startTime !== "string" || startTime.length < 10) throw new Error("start_time is required");
  const start_date = args.start_date || startTime.slice(0, 10);
  const body = {
    title: args.title,
    description: args.description ?? null,
    start_time: startTime,
    end_time: args.end_time ?? null,
    all_day: args.all_day,
    category: args.category ?? null,
    color: args.color ?? null,
    group_title: args.group_title ?? null,
    frequency: args.frequency,
    interval: 1,
    weekdays: args.weekdays,
    start_date,
    end_date: args.end_date ?? null,
    occurrence_count: args.occurrence_count ?? null,
    idempotency_key: crypto.randomUUID(),
  };
  if (body.frequency === "monthly") {
    body.monthly_mode = "day-of-month";
    body.monthly_day = Number(start_date.slice(8, 10));
  } else {
    body.monthly_mode = null;
    body.monthly_day = null;
  }
  return body;
}

// 对应 POST /api/event-series
async function runCreateEventSeries(env, args = {}) {
  const body = buildRecurrenceBody(args);
  body.color = (await resolveDefaultColor(env, body.category, body.color)) ?? null;
  const eventMessage = validateEventInput(body, true);
  if (eventMessage) throw new Error(eventMessage);
  const recurrenceMessage = validateRecurringRequest(body);
  if (recurrenceMessage) throw new Error(recurrenceMessage);

  let instances;
  try {
    instances = generateInstances(body);
  } catch (err) {
    throw new Error(err.message || "Invalid recurrence rule");
  }

  const seriesId = crypto.randomUUID();
  const now = nowIso();
  const series = seriesFromRequest({ ...body, all_day: toIntBool(body.all_day) }, seriesId, body.idempotency_key, now);
  const statements = [insertSeriesStatement(env.DB, series)];
  instances.forEach((instance, index) => statements.push(insertInstanceStatement(env.DB, series, instance, index)));
  await batch(env.DB, statements);
  return { series_id: seriesId, created_count: instances.length };
}

// 对应 GET /api/event-series/:id
async function runGetEventSeries(env, args = {}) {
  const { id } = args;
  if (typeof id !== "string" || id === "") throw new Error("id is required");
  const series = await getActiveSeries(env, id);
  if (!series) throw new Error("Event series not found");
  const events = await queryAll(
    env.DB,
    "SELECT * FROM events WHERE series_id = ? AND deleted_at IS NULL ORDER BY start_time ASC",
    [id],
  );
  const exceptions = await queryAll(
    env.DB,
    "SELECT * FROM event_exceptions WHERE series_id = ? ORDER BY original_start_time ASC",
    [id],
  );
  return { series: rowToSeries(series), events: events.map(rowToEvent), exceptions };
}

// 对应 PATCH /api/event-series/:id（MCP 版：每次调用为独立操作，不走 event_operations 幂等表）
const SERIES_PATCH_FIELDS = [
  "title", "description", "category", "color", "group_title", "all_day",
  "start_time", "end_time", "frequency", "weekdays", "start_date",
  "end_date", "occurrence_count",
];

async function runUpdateEventSeries(env, args = {}) {
  const { id } = args;
  if (typeof id !== "string" || id === "") throw new Error("id is required");
  const series = await getActiveSeries(env, id);
  if (!series) throw new Error("Event series not found");

  const merged = mergeSeriesPatch(series, args, SERIES_PATCH_FIELDS);
  if (args.start_time !== undefined && args.start_date === undefined) {
    merged.start_date = String(merged.start_time).slice(0, 10);
  }
  if (typeof merged.color === "string" && merged.color.toLowerCase() === "default") {
    merged.color = await resolveDefaultColor(env, merged.category, "default");
  }
  merged.interval = 1;
  if (merged.frequency === "monthly") {
    merged.monthly_mode = "day-of-month";
    merged.monthly_day = Number(String(merged.start_date).slice(8, 10));
  } else {
    merged.monthly_mode = null;
    merged.monthly_day = null;
  }
  merged.idempotency_key = crypto.randomUUID();

  const eventMessage = validateEventInput(merged, true);
  if (eventMessage) throw new Error(eventMessage);
  const temporalMessage = validateEventTemporalOrder(merged);
  if (temporalMessage) throw new Error(temporalMessage);
  const recurrenceMessage = validateRecurringRequest(merged);
  if (recurrenceMessage) throw new Error(recurrenceMessage);

  let instances;
  try {
    instances = generateInstances(merged);
  } catch (err) {
    throw new Error(err.message || "Invalid recurrence rule");
  }

  const exceptions = await queryAll(env.DB, "SELECT * FROM event_exceptions WHERE series_id = ?", [id]);
  const occurrenceSet = new Set(instances.map((i) => i.start_time));
  const validExceptionSet = new Set(
    exceptions.filter((e) => occurrenceSet.has(e.original_start_time)).map((e) => e.original_start_time),
  );
  const invalidExceptions = exceptions.filter((e) => !occurrenceSet.has(e.original_start_time));

  const now = nowIso();
  const updatedSeries = seriesFromRequest(merged, id, series.idempotency_key, now);
  updatedSeries.created_at = series.created_at;

  const statements = [
    env.DB.prepare(
      `UPDATE event_series SET title=?, description=?, category=?, color=?, group_title=?, all_day=?,
        start_time=?, end_time=?, frequency=?, interval=?, weekdays=?, monthly_mode=?, monthly_day=?,
        start_date=?, end_date=?, occurrence_count=?, updated_at=? WHERE id=? AND deleted_at IS NULL`,
    ).bind(
      updatedSeries.title, updatedSeries.description, updatedSeries.category, updatedSeries.color,
      updatedSeries.group_title, updatedSeries.all_day, updatedSeries.start_time, updatedSeries.end_time,
      updatedSeries.frequency, updatedSeries.interval, updatedSeries.weekdays, updatedSeries.monthly_mode,
      updatedSeries.monthly_day, updatedSeries.start_date, updatedSeries.end_date,
      updatedSeries.occurrence_count, now, id,
    ),
    env.DB.prepare("UPDATE events SET deleted_at=?, updated_at=? WHERE series_id=? AND deleted_at IS NULL").bind(now, now, id),
  ];
  invalidExceptions.forEach((e) => {
    statements.push(env.DB.prepare("DELETE FROM event_exceptions WHERE id=? AND series_id=?").bind(e.id, id));
  });
  instances.forEach((instance, index) => {
    if (!validExceptionSet.has(instance.start_time)) {
      statements.push(insertInstanceStatement(env.DB, updatedSeries, instance, index, now));
    }
  });

  await batch(env.DB, statements);
  return { series_id: id, updated: true, created_count: instances.length };
}

// 对应 DELETE /api/event-series/:id
async function runDeleteEventSeries(env, args = {}) {
  const { id } = args;
  if (typeof id !== "string" || id === "") throw new Error("id is required");
  const series = await getActiveSeries(env, id);
  if (!series) throw new Error("Event series not found");
  const now = nowIso();
  await batch(env.DB, [
    env.DB.prepare("UPDATE event_series SET deleted_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL").bind(now, now, id),
    env.DB.prepare("UPDATE events SET deleted_at=?, updated_at=? WHERE series_id=? AND deleted_at IS NULL").bind(now, now, id),
  ]);
  return { id, deleted: true };
}

// 判断 originalStartTime 是否为该系列的一个实例；返回 { instance, index } 或 null。
function occurrenceFor(series, originalStartTime) {
  const instances = generateInstances(seriesRowToRequest(series));
  const index = instances.findIndex((i) => i.start_time === originalStartTime);
  return index < 0 ? null : { instance: instances[index], index };
}

// 对应 POST /api/event-series/:id/exceptions —— 跳过某一次
async function runSkipOccurrence(env, args = {}) {
  const seriesId = args.series_id;
  const originalStartTime = args.original_start_time;
  if (typeof seriesId !== "string" || seriesId === "") throw new Error("series_id is required");
  if (!isValidIso(originalStartTime)) throw new Error("original_start_time must be a valid ISO 8601 value");

  const series = await getActiveSeries(env, seriesId);
  if (!series) throw new Error("Event series not found");

  let occurrence;
  try {
    occurrence = occurrenceFor(series, originalStartTime);
  } catch (err) {
    throw new Error(err.message || "Invalid recurrence rule");
  }
  if (!occurrence) throw new Error("The specified time is not an occurrence of this series");

  const existing = await queryOne(
    env.DB,
    "SELECT * FROM event_exceptions WHERE series_id = ? AND original_start_time = ?",
    [seriesId, originalStartTime],
  );
  if (existing) return { ...existing, skipped: true };

  const now = nowIso();
  await batch(env.DB, [
    env.DB.prepare("INSERT INTO event_exceptions (id, series_id, original_start_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), seriesId, originalStartTime, now, now),
    env.DB.prepare("UPDATE events SET deleted_at = ?, updated_at = ? WHERE series_id = ? AND original_start_time = ? AND deleted_at IS NULL")
      .bind(now, now, seriesId, originalStartTime),
  ]);
  const created = await queryOne(
    env.DB,
    "SELECT * FROM event_exceptions WHERE series_id = ? AND original_start_time = ?",
    [seriesId, originalStartTime],
  );
  return { ...created, skipped: true };
}

// 对应 DELETE /api/event-series/:id/exceptions/:exceptionId —— 恢复被跳过的一次
async function runRestoreOccurrence(env, args = {}) {
  const seriesId = args.series_id;
  const originalStartTime = args.original_start_time;
  if (typeof seriesId !== "string" || seriesId === "") throw new Error("series_id is required");
  if (!isValidIso(originalStartTime)) throw new Error("original_start_time must be a valid ISO 8601 value");

  const series = await getActiveSeries(env, seriesId);
  if (!series) throw new Error("Event series not found");

  const exception = await queryOne(
    env.DB,
    "SELECT * FROM event_exceptions WHERE series_id = ? AND original_start_time = ?",
    [seriesId, originalStartTime],
  );
  if (!exception) throw new Error("Event exception not found");

  let occurrence;
  try {
    occurrence = occurrenceFor(series, originalStartTime);
  } catch (err) {
    throw new Error(err.message || "Invalid recurrence rule");
  }
  if (!occurrence) throw new Error("The exception no longer matches this series");

  const now = nowIso();
  const existing = await queryOne(
    env.DB,
    "SELECT * FROM events WHERE series_id = ? AND original_start_time = ? ORDER BY deleted_at IS NULL DESC LIMIT 1",
    [seriesId, originalStartTime],
  );
  const statements = [
    env.DB.prepare("DELETE FROM event_exceptions WHERE id = ? AND series_id = ?").bind(exception.id, seriesId),
  ];
  if (existing) {
    statements.push(env.DB.prepare("UPDATE events SET deleted_at = NULL, updated_at = ? WHERE id = ?").bind(now, existing.id));
  } else {
    statements.push(
      env.DB.prepare(`INSERT INTO events
        (id, title, description, start_time, end_time, all_day, category, color,
         group_title, source, external_id, series_id, recurrence_index,
         original_start_time, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(), series.title, series.description,
          occurrence.instance.start_time, occurrence.instance.end_time,
          series.all_day, series.category, series.color, series.group_title,
          "series", null, seriesId, occurrence.index,
          occurrence.instance.start_time, now, now, null,
        ),
    );
  }
  await batch(env.DB, statements);
  return { series_id: seriesId, original_start_time: originalStartTime, restored: true };
}

// 把请求体的起始日期平移到 newStartDate（用于 split 的新段），保留时间部分与时长。
function moveRequestStartDate(body, newStartDate) {
  const oldStartDate = body.start_time.slice(0, 10);
  const startSuffix = body.start_time.slice(10);
  const endSuffix = body.end_time ? body.end_time.slice(10) : "";
  const endDelta = body.end_time ? dateDelta(oldStartDate, body.end_time.slice(0, 10)) : 0;
  return {
    ...body,
    start_date: newStartDate,
    start_time: `${newStartDate}${startSuffix}`,
    end_time: body.end_time ? `${shiftDate(newStartDate, endDelta)}${endSuffix}` : null,
  };
}

// 对应 POST /api/event-series/:id/split —— 从 split_date 起切成两段
async function runSplitSeries(env, args = {}) {
  const seriesId = args.series_id;
  const splitDate = args.split_date;
  if (typeof seriesId !== "string" || seriesId === "") throw new Error("series_id is required");
  if (!isValidDateKey(splitDate)) throw new Error("split_date must be a valid YYYY-MM-DD date");

  const series = await getActiveSeries(env, seriesId);
  if (!series) throw new Error("Event series not found");
  if (!series.end_date || series.occurrence_count !== null) {
    throw new Error("Split requires a series with end_date and no occurrence_count");
  }
  if (splitDate <= series.start_date || splitDate >= series.end_date) {
    throw new Error("split_date must be inside the series date range");
  }

  const oldBody = seriesRowToRequest(series);
  oldBody.end_date = shiftDate(splitDate, -1);
  oldBody.occurrence_count = null;
  oldBody.idempotency_key = crypto.randomUUID();

  const newBody = seriesRowToRequest(series);
  Object.assign(newBody, moveRequestStartDate(newBody, splitDate));
  newBody.end_date = series.end_date;
  newBody.occurrence_count = null;
  newBody.idempotency_key = crypto.randomUUID();

  const oldMessage = validateRecurringRequest(oldBody);
  const newMessage = validateRecurringRequest(newBody);
  if (oldMessage || newMessage) throw new Error(oldMessage || newMessage);

  let newInstances;
  try {
    generateInstances(oldBody);
    newInstances = generateInstances(newBody);
  } catch (err) {
    throw new Error(err.message || "Invalid split rule");
  }

  const exceptions = await queryAll(
    env.DB,
    "SELECT * FROM event_exceptions WHERE series_id = ? AND substr(original_start_time, 1, 10) >= ?",
    [seriesId, splitDate],
  );
  const migratedExceptions = new Set(exceptions.map((e) => e.original_start_time));
  const now = nowIso();
  const newSeriesId = crypto.randomUUID();
  const newSeries = seriesFromRequest(newBody, newSeriesId, crypto.randomUUID(), now);

  const statements = [
    env.DB.prepare("UPDATE event_series SET end_date = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL").bind(oldBody.end_date, now, seriesId),
    env.DB.prepare("UPDATE events SET deleted_at = ?, updated_at = ? WHERE series_id = ? AND substr(original_start_time, 1, 10) >= ? AND deleted_at IS NULL").bind(now, now, seriesId, splitDate),
    env.DB.prepare("UPDATE event_exceptions SET series_id = ?, updated_at = ? WHERE series_id = ? AND substr(original_start_time, 1, 10) >= ?").bind(newSeriesId, now, seriesId, splitDate),
    insertSeriesStatement(env.DB, newSeries),
  ];
  newInstances.forEach((instance, index) => {
    if (!migratedExceptions.has(instance.start_time)) {
      statements.push(insertInstanceStatement(env.DB, newSeries, instance, index, now));
    }
  });
  await batch(env.DB, statements);
  return {
    old_series_id: seriesId,
    new_series_id: newSeriesId,
    old_end_date: oldBody.end_date,
    new_start_date: splitDate,
    created_count: newInstances.length,
  };
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
    case "list_deadlines": return runListDeadlines(env, args);
    case "create_deadline": return runCreateDeadline(env, args);
    case "get_deadline": return runGetDeadline(env, args);
    case "update_deadline": return runUpdateDeadline(env, args);
    case "delete_deadline": return runDeleteDeadline(env, args);
    case "complete_deadline": return runSetDeadlineCompletion(env, args, true);
    case "reopen_deadline": return runSetDeadlineCompletion(env, args, false);
    case "create_event": return runCreateEvent(env, args);
    case "update_event": return runUpdateEvent(env, args);
    case "delete_event": return runDeleteEvent(env, args);
    case "create_event_series": return runCreateEventSeries(env, args);
    case "get_event_series": return runGetEventSeries(env, args);
    case "update_event_series": return runUpdateEventSeries(env, args);
    case "delete_event_series": return runDeleteEventSeries(env, args);
    case "skip_occurrence": return runSkipOccurrence(env, args);
    case "restore_occurrence": return runRestoreOccurrence(env, args);
    case "split_series": return runSplitSeries(env, args);
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

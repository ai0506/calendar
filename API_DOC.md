# AI0506 Calendar — API 文档 (API_DOC)

> 状态：**Phase 1 后端基础已完成。** 认证、events CRUD、批量导入、分类、导出均已实现（Stage 4–6）。

## 通用约定

- **Base URL**：`https://calendar.ai0506.com/api`（本地：`http://localhost:8788/api`）
- **时间格式**：所有时间字段均为 **ISO 8601 带时区偏移**，例如 `2026-07-14T19:00:00+08:00`。按提交的偏移原样存储，不强制转 UTC。
- **请求/响应体**：JSON（`Content-Type: application/json`）。
- **响应信封**：
  - 成功：`{ "ok": true, "data": <payload> }`
  - 失败：`{ "ok": false, "error": { "code": "<string>", "message": "<string>" } }`
- **HTTP 状态**：`200` 成功，`400` 参数错误，`401` 未认证，`404` 不存在，`409` 冲突，`500` 服务器错误。

## 认证

两种机制，按客户端分离（见 PROJECT_SPEC §5）。除登录接口外，所有 `/api/*` 均需认证。

### 浏览器 — Session Cookie
登录成功后浏览器自动携带 `httpOnly` 签名 Cookie，无需手动处理。

### App / AI Agent — Bearer Token
请求头携带令牌：
```
Authorization: Bearer <API_TOKEN>
```
Phase 1 使用单一 `API_TOKEN`（环境变量）。

---

## 端点

### 认证

#### `POST /api/auth/login`
请求：
```json
{ "password": "your-private-password" }
```
成功：`200`，下发 Session Cookie，返回 `{ "ok": true, "data": { "authenticated": true } }`。
失败：`401`，`{ "ok": false, "error": { "code": "invalid_password", "message": "..." } }`。

#### `POST /api/auth/logout`
清除 Session Cookie。返回 `{ "ok": true, "data": { "authenticated": false } }`。

#### `GET /api/auth/status`
返回当前认证状态：`{ "ok": true, "data": { "authenticated": true } }`。

---

### 事件 (Events) — ✅ 已实现 (Stage 5)

> 所有 events 端点由全局 middleware 保护（需 Cookie 或 Bearer Token）。
> 时间字段原样保留客户端提交的时区偏移，服务器不做 UTC 转换。
> 响应中 `all_day` 为布尔值；`id` / `created_at` / `updated_at` 由服务器生成。

#### `GET /api/events`
查询参数（均可选）：
| 参数 | 说明 |
|------|------|
| `from` | 起始时间（ISO 8601 带时区偏移），过滤 `start_time >= from` |
| `to` | 结束时间（ISO 8601 带时区偏移），过滤 `start_time <= to` |
| `category` | 按分类名过滤 |

返回未软删除的事件数组：
```json
{ "ok": true, "data": [ { /* event */ } ] }
```

#### `POST /api/events`
创建事件。`id` / `created_at` / `updated_at` 由服务器生成。
请求：
```json
{
  "title": "AS Physics 复习",
  "description": "力学章节",
  "start_time": "2026-07-14T19:00:00+08:00",
  "end_time": "2026-07-14T21:00:00+08:00",
  "all_day": false,
  "category": "Physics",
  "color": "#3b82f6",
  "group_title": "上学",
  "source": "web",
  "external_id": null
}
```
成功：`201`，返回创建的事件对象。

#### `GET /api/events/:id`
返回单个事件；不存在返回 `404`。

#### `PUT /api/events/:id`
更新事件（可传部分字段）。`updated_at` 由服务器刷新。返回更新后的事件对象。

#### `DELETE /api/events/:id`
**软删除**：设置 `deleted_at`，不物理删除。返回 `{ "ok": true, "data": { "id": "...", "deleted": true } }`。

---

### 重复事件系列 (Event Series) — ✅ 已实现

> 重复系列端点同样由全局 middleware 保护。当前支持创建、查询、删除、系列修改、split 和单次 except。
> 创建时服务端计算全部实例，并用 D1 `batch()` 原子写入系列和实例。

#### `POST /api/event-series`

创建一个重复事件系列。`idempotency_key` 由客户端为一次新建操作生成 UUID；网络重试必须复用同一个 key。

请求示例：

```json
{
  "title": "Physics Revision",
  "start_time": "2026-07-14T19:00:00+08:00",
  "end_time": "2026-07-14T21:00:00+08:00",
  "all_day": false,
  "category": "Physics",
  "frequency": "weekly",
  "interval": 1,
  "weekdays": [2, 4, 6],
  "monthly_mode": null,
  "monthly_day": null,
  "start_date": "2026-07-14",
  "end_date": "2026-08-31",
  "occurrence_count": null,
  "idempotency_key": "550e8400-e29b-41d4-a716-446655440000"
}
```

首版 `frequency` 支持 `daily` / `weekly` / `monthly` / `yearly`。每周 `weekdays` 使用 0–6 表示周日到周六；每月只支持起始日期对应的日期。必须提供 `end_date` 或 `occurrence_count`，最大实例数为 366，计算候选周期最多 10,000 次。

成功：`201`，返回摘要：

```json
{ "ok": true, "data": { "series_id": "...", "created_count": 21 } }
```

同一个 `idempotency_key` 重试会返回原系列摘要，不会重复创建，状态为 `200`。

#### `GET /api/event-series/:id`

返回系列规则、当前未软删除的实例和已登记的 exceptions。被 except 的原始实例不会出现在 `events` 中，但会出现在 `exceptions` 中：

```json
{ "ok": true, "data": { "series": { "id": "..." }, "events": [], "exceptions": [] } }
```

#### `PATCH /api/event-series/:id`

部分修改重复规则。服务端将存储的 series 行和请求 body 合并后调用同一套 `validateRecurringRequest` / `generateInstances`，重新生成实例。

请求必须携带：

```http
Idempotency-Key: <operation-uuid>
```

该操作会生成新的实例 ID；之前通过 `PUT /api/events/:id` 单独修改的实例不会保留。仍属于新规则的 exceptions 会保留，不再属于新规则的 exceptions 会被清理。成功响应：

```json
{ "ok": true, "data": { "series_id": "...", "updated": true, "created_count": 21 } }
```

相同 key 重试返回相同摘要；相同 key 搭配不同请求返回 `409`。

#### `POST /api/event-series/:id/exceptions`

只跳过重复规则中的一次，不创建替代事件。延期或替代安排应另行调用 `POST /api/events` 创建普通事件。

请求：

```json
{ "original_start_time": "2026-07-20T19:00:00+08:00" }
```

服务端使用 `generateInstances` 判断目标是否确实属于该系列；不属于时返回 `400 not_an_occurrence`。如果对应实例已经生成，则软删除该实例；如果尚未存在，则只保存 exception。相同目标重复提交幂等返回已有 exception。

#### `DELETE /api/event-series/:seriesId/exceptions/:exceptionId`

删除 exception 并恢复原规则对应的实例。exception 控制记录采用硬删除，恢复过程与删除 exception 在同一个 D1 `batch()` 中完成。

#### `POST /api/event-series/:id/split`

将一个具有 `end_date` 且没有 `occurrence_count` 的系列分成前后两段。`split_date` 属于新段：旧系列结束于前一天，新系列从该日期开始。新系列获得新的 `id` 和 `event_series.idempotency_key`；旧系列在 split_date 之后的实例会软删除，相关 exceptions 会迁移到新系列。

请求必须携带：

```http
Idempotency-Key: <operation-uuid>
```

```json
{ "split_date": "2026-08-01" }
```

成功响应：

```json
{
  "ok": true,
  "data": {
    "old_series_id": "...",
    "new_series_id": "...",
    "old_end_date": "2026-07-31",
    "new_start_date": "2026-08-01",
    "created_count": 9
  }
}
```

只有 `occurrence_count` 的系列暂不支持 split，返回 `400 split_not_supported_for_count_series`。split 使用 `event_operations` 保存操作幂等键，支持并发冲突回查。

#### `DELETE /api/event-series/:id`

使用 D1 `batch()` 软删除系列和该系列全部未删除实例。返回：

```json
{ "ok": true, "data": { "id": "...", "deleted": true } }
```

单个系列实例仍可使用 `DELETE /api/events/:id` 删除，不影响系列其他实例。

---

### 批量导入 (Import) — ✅ 已实现 (Stage 6)

#### `POST /api/events/import`
供 AI Agent / CSV 导入工具 / Android App / 外部程序批量创建，**幂等**：按 `(source, external_id)` 去重，防止重复创建。
`source` 为每条事件的字段（未提供则默认 `"web"`），不是请求体顶层字段。

请求：
```json
{
  "events": [
    {
      "title": "Physics Session",
      "start_time": "2026-07-14T19:00:00+08:00",
      "end_time": "2026-07-14T21:00:00+08:00",
      "category": "Physics",
      "source": "agent",
      "external_id": "summer-2026-phys-01"
    }
  ]
}
```
- 同 `(source, external_id)` 已存在 → **更新**该事件（title / description / 时间 / category / color / group_title，`updated_at` 刷新）。
- 不存在（或未提供 `external_id`）→ **新建**。
- 单条事件缺少必填字段（`title` / `start_time`）→ 计入 `skipped`，不中断整批。

响应：
```json
{ "ok": true, "data": { "created": 1, "updated": 0, "skipped": 0 } }
```

**去重验证示例**：连续两次导入同一个 `(source="agent", external_id="summer-2026-phys-01")`，第一次 `created:1`，第二次 `created:0, updated:1`，数据库中仅保留一行。

---

### 分类 (Categories) — ✅ 已实现 (Stage 6)

#### `GET /api/categories`
返回全部分类，按 `sort_order` 升序、再按 `name` 升序（含种子的 8 个：Math / Physics / CS / Other Subjects / Research / Projects / Leisure / Tech）：
```json
{
  "ok": true,
  "data": [
    { "id": "cat-physics", "name": "Physics", "color": "#0891b2", "sort_order": 4, "created_at": "2026-07-10T00:00:00+08:00" }
  ]
}
```

#### `POST /api/categories`
创建分类。`id` / `created_at` 由服务器生成；`name` / `color` 必填，`sort_order` 可选（默认 `0`）。
请求：
```json
{ "name": "Chemistry", "color": "#10b981", "sort_order": 9 }
```
成功：`201`，返回创建的分类对象。
名称重复：`409`，`{ "ok": false, "error": { "code": "conflict", "message": "..." } }`。

---

### 导出 (Export) — ✅ 已实现 (Stage 6)

#### `GET /api/export?format=json|csv|md`
| format | Content-Type | 用途 |
|--------|--------------|------|
| `json` | `application/json; charset=utf-8` | 程序处理 / 未来 Agent |
| `csv` | `text/csv; charset=utf-8` | Excel |
| `md` | `text/markdown; charset=utf-8` | 发送给 ChatGPT / Claude 分析 / 人工阅读 |

导出全部未软删除事件（`deleted_at IS NULL`），按 `start_time` 升序。`format` 缺省时默认 `json`；无效 format 返回 `400`。

**json**：`{ "ok": true, "data": [ { /* event */ } ] }`（字段同 events API）。

**csv**：表头 `id,title,description,start_time,end_time,all_day,category,color,group_title,source,external_id`；含逗号/引号/换行的字段自动加引号转义。

**md** 示例：
```markdown
# Calendar

## 2026-07-14

- 19:00 Physics revision [Physics]
```
按日期分组（`## YYYY-MM-DD`），组内按时间排序；全天事件显示 `All day`；分类以 `[Category]` 附在标题后（无分类则省略）。

---

## 错误码（草案）

| code | 含义 |
|------|------|
| `unauthorized` | 未认证 / Cookie 或 Token 无效 |
| `invalid_password` | 登录密码错误 |
| `validation_error` | 请求体字段校验失败 |
| `not_found` | 资源不存在 |
| `conflict` | 唯一约束冲突（如分类名重复） |
| `not_an_occurrence` | 指定时间不是该重复系列的有效实例 |
| `split_not_supported_for_count_series` | 只有 occurrence_count 的系列暂不支持 split |
| `server_error` | 内部错误 |

---

## Deadlines（单次 DDL）

DDL 是独立于 `events` 的截止事项。当前不支持重复 DDL、批量导入或导出扩展；REST API 和 MCP 均支持单次 DDL。

### 数据和时间约定

- `due_time` 使用 `YYYY-MM-DD` 或带时区的 ISO 8601 日期时间。
- `all_day=true` 时必须使用 `YYYY-MM-DD`；截止日当天仍为 `open`，次日按 `Asia/Shanghai` 变为 `overdue`。
- `all_day=false` 时必须使用带时区的日期时间。
- `completed_at` 存在时返回 `status=completed`、`is_overdue=false`。
- 列表和详情排除软删除数据，因此公开 API 不返回 `status=deleted`。
- `category` 复用现有 `categories`；`color=null` 或 `color="default"` 表示跟随分类颜色。
- `priority` 表示 DDL 重要程度，只允许 `high` / `default` / `low`，缺省为 `default`；不改变截止状态和截止时间。
- 空字符串或全空白 `external_id` 会归一化为 `null`。

### `GET /api/deadlines`

可选参数：

| 参数 | 说明 |
|---|---|
| `from` / `to` | `YYYY-MM-DD` 日期范围，包含边界 |
| `category` | 共享分类过滤 |
| `include_completed` | 缺省、`true`、`1` 表示包含；`false`、`0` 表示排除；其他值返回 `400` |

服务端按存储值的日期部分查询，并按日历日期、全天优先、`julianday(due_time)`、`id` 排序。

### `POST /api/deadlines`

成功返回 `201`。重复的 `(source, external_id)` 返回 `409 conflict`，包括原记录已软删除的情况。

### `GET/PUT/DELETE /api/deadlines/:id`

GET 返回活动 DDL；PUT 只允许修改标题、描述、截止时间、全天标志、分类、颜色、分组和 `priority`；DELETE 使用软删除。 `source` 和 `external_id` 创建后不可修改。

`priority` 只允许 `high`、`default`、`low`，缺省值为 `default`。

### `POST /api/deadlines/:id/complete`

将未完成 DDL 设置为完成，并写入 `completed_at`。重复 complete 直接返回当前对象，不更新 `updated_at`。

### `POST /api/deadlines/:id/reopen`

将已完成 DDL 的 `completed_at` 清空。重复 reopen 直接返回当前对象，不更新 `updated_at`。

两个状态接口使用目标状态条件 UPDATE；目标记录不存在或已软删除返回 `404`。

### MCP 工具

Remote MCP `/mcp` 提供与上述 REST API 对应的单次 DDL 工具：

| 工具 | 作用 |
|---|---|
| `list_deadlines` | 按日期范围、分类和完成状态查询；不传日期时默认返回上海时间起未来 30 天 |
| `create_deadline` | 创建单次 DDL，`priority` 支持 `high` / `default` / `low` |
| `get_deadline` | 按 `id` 查询单个活动 DDL |
| `update_deadline` | 修改 DDL 字段；`source` 和 `external_id` 不可修改 |
| `delete_deadline` | 软删除 DDL |
| `complete_deadline` | 标记完成，重复调用幂等 |
| `reopen_deadline` | 重新打开，重复调用幂等 |

MCP 工具直接访问同一 D1 数据库，并复用 REST 的字段校验、优先级枚举、截止状态和软删除规则。

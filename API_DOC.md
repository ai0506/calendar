# AI0506 Calendar — API 文档 (API_DOC)

> 状态：**Phase 1 实现中。** 认证与 events CRUD 已实现（Stage 4–5）；import / categories / export 仍为设计草案，标注见各节。

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

### 批量导入 (Import)

#### `POST /api/events/import`
供 AI Agent / 导入工具批量创建，**幂等**：按 `(source, external_id)` 去重，防止重复创建。
请求：
```json
{
  "source": "agent",
  "events": [
    {
      "external_id": "summer-2026-phys-01",
      "title": "Physics Session",
      "start_time": "2026-07-14T19:00:00+08:00",
      "end_time": "2026-07-14T21:00:00+08:00",
      "category": "Physics"
    }
  ]
}
```
- `external_id` 已存在（同 `source`）→ 更新该事件（或跳过，见 `mode`，Phase 1 默认更新）。
- `external_id` 不存在 → 新建。

返回统计：
```json
{ "ok": true, "data": { "created": 1, "updated": 0, "skipped": 0 } }
```

---

### 分类 (Categories)

#### `GET /api/categories`
返回全部分类（含种子的 8 个）：
```json
{ "ok": true, "data": [ { "id": "...", "name": "Physics", "color": "#3b82f6", "sort_order": 4 } ] }
```

#### `POST /api/categories`
创建分类：
```json
{ "name": "Chemistry", "color": "#10b981", "sort_order": 9 }
```
名称重复返回 `409`。

---

### 导出 (Export)

#### `GET /api/export?format=json|csv|md`
| format | Content-Type | 用途 |
|--------|--------------|------|
| `json` | `application/json` | 程序处理 |
| `csv` | `text/csv` | Excel |
| `md` | `text/markdown` | 发送给 ChatGPT / Claude 分析 |

导出全部未软删除事件。

---

## 错误码（草案）

| code | 含义 |
|------|------|
| `unauthorized` | 未认证 / Cookie 或 Token 无效 |
| `invalid_password` | 登录密码错误 |
| `validation_error` | 请求体字段校验失败 |
| `not_found` | 资源不存在 |
| `conflict` | 唯一约束冲突（如分类名重复） |
| `server_error` | 内部错误 |

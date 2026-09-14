# AI0506 Calendar — API 文档 (API_DOC)

> 状态：**Phase 1 核心功能已完成，前端与通知功能已接入。** 认证、events CRUD、重复系列、Deadline、批量导入、分类、导出、MCP 及通知接口均已实现；当前剩余工作主要是部署验收和已知问题收敛。

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

每个返回的 Event 都额外带有 `reminders`（实际生效的分钟数组）。未配置时为默认 `[60, 10]`，显式关闭时为 `[]`；重复实例继承系列配置。该字段为客户端恢复本地提醒而提供，不改变原有 Event 字段。

查询参数（均可选）：
| 参数 | 说明 |
|------|------|
| `from` | 起始时间（ISO 8601 带时区偏移），过滤 `start_time >= from` |
| `to` | 结束时间（ISO 8601 带时区偏移），过滤 `start_time <= to` |
| `category` | 按分类名过滤 |
| `subject_id` | 按科目 id 过滤（Academics 子类，见「分类与科目」） |

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

可选 `reminders` 为最多两个提醒分钟数，例如 `[60, 10]`。未提供时默认使用 `[60, 10]`；`[]` 明确关闭提醒。允许值为 `10`、`15`、`30`、`60`、`120`、`1440`。全天 Event 不接受非空 `reminders`。

#### `GET /api/events/:id`
返回单个事件；不存在返回 `404`。响应额外附带 `reminders` 字段（该事件生效的提醒分钟数组，如 `[60, 10]`；全天事件为 `[]`），供详情视图直接展示，无需二次请求。

#### `PUT /api/events/:id`
更新事件（可传部分字段）。`updated_at` 由服务器刷新。返回更新后的事件对象。

未提供 `reminders` 时保留既有默认/custom/disabled 配置；显式 `[]` 关闭，非空数组替换为 custom 配置。重复系列的单个 occurrence 不允许在此端点修改 `reminders`，应通过系列 PATCH 修改。

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
- 导入项可带 `reminders`，规则与 Event POST/PUT 相同；更新时未提供则保留已有提醒配置。

---

### 通知 (Notifications)

#### `GET /api/notifications?include_read=false&limit=50`

读取通知前会派发已到期的 server-side reminder。默认只返回未读通知；`limit` 范围为 1–100。过期的 Event 提醒会跳过；Deadline 的提前提醒在到期后跳过，最终 due 提醒最多保留 24 小时补发窗口，避免网页重新打开时集中生成多条陈旧通知。

每个通知除原字段外还返回对应提醒计划的 `scheduled_at`。`created_at` 表示通知实际生成时间，`scheduled_at` 表示原计划提醒时间；网页端应优先展示后者。返回：

```json
{ "ok": true, "data": { "items": [], "unread_count": 0 } }
```

#### `PATCH /api/notifications/:id`

将指定通知标为已读。提醒计划、通知记录和已读状态均由服务端保存；同一 reminder 最多生成一条通知。

响应：
```json
{ "ok": true, "data": { "id": "notification-id", "read": true } }
```

#### `POST /api/notifications/read-all`

将所有未读通知一次性标为已读。返回本次更新的条数：

```json
{ "ok": true, "data": { "updated": 3 } }
```

**去重验证示例**：连续两次导入同一个 `(source="agent", external_id="summer-2026-phys-01")`，第一次 `created:1`，第二次 `created:0, updated:1`，数据库中仅保留一行。

---

### 分类 (Categories) — ✅ 已实现 (Stage 6)

#### `GET /api/categories`
返回全部**未归档**分类，按 `sort_order` 升序、再按 `name` 升序（当前 5 个：Academics / Research / Projects / Leisure / Tech）：
```json
{
  "ok": true,
  "data": [
    { "id": "cat-academics", "name": "Academics", "color": "#78716c", "sort_order": 1, "kind": "academics", "archived": 0, "created_at": "2026-09-04T00:00:00+08:00" }
  ]
}
```

`kind` 为 `academics` 的分类拥有 Subject 子类；其余为 `normal`。
`archived = 1` 的分类（迁移 0012 归档的 Math / Physics / CS / Other Subjects）不在本端点返回，
也不再接受写入，但历史数据和旧订阅 URL 仍可解析。

#### `POST /api/categories`
创建分类。`id` / `created_at` 由服务器生成；`name` / `color` 必填，`sort_order` 可选（默认 `0`）。
请求：
```json
{ "name": "Chemistry", "color": "#10b981", "sort_order": 9 }
```
成功：`201`，返回创建的分类对象。
名称重复：`409`，`{ "ok": false, "error": { "code": "conflict", "message": "..." } }`。

**`category` 字段的合法性校验**：Event（含批量导入）、Event Series、Deadline 的创建/修改端点（REST 与 MCP 均一致）在写入前都会检查传入的 `category` 是否已存在于本表且未归档；不存在或已归档则返回 `400 validation_error`（批量导入 `POST /api/events/import` 中单条 `category` 非法则计入 `skipped`，不影响整批）。这里没有数据库外键，是应用层强制的约束，用于防止调用方（尤其 AI Agent）凭空发明分类名。新增分类目前只能通过本端点（暂无对应 MCP 工具）；`category` 留空或为 `null` 则不做校验。

---

### 科目 (Subjects) — ✅ 已实现

Subject 是 `kind = "academics"` 分类专属的子类（学科）。Category 表示日程的组织范围，
Subject 表示学业事项属于哪一门科；两者不再混用同一个字段。

#### `GET /api/subjects`
返回启用中的科目，按 `sort_order`、`name` 升序。加 `?include_inactive=1` 返回全部。
```json
{
  "ok": true,
  "data": [
    { "id": "sub-math", "name": "Math", "category_id": "cat-academics", "color": "#ff3b30", "sort_order": 1, "active": 1 }
  ]
}
```

#### `POST /api/subjects`
创建科目。`name` 与六位 hex `color` 必填；`sort_order` 可选（默认 `0`）；
`category_id` 可选，省略时挂到当前的 academics 分类。名称重复返回 `409`。

#### `subject_id` 的合法性校验
Event（含批量导入）、Event Series、Deadline 的所有写路径（REST 与 MCP）共用同一套校验：

```text
category.kind = 'normal'                  → subject_id 必须为空，否则 400
category.kind = 'academics' + subject_id  → subject 必须存在、属于该分类且 active = 1
category.kind = 'academics' + 无 subject  → 合法，表示学业但未指定科目
```

把分类从 academics 改成普通分类时，若请求未显式给出 `subject_id`，服务端会自动把它清空，
不会因为残留的旧 `subject_id` 而拒绝请求。

#### 颜色解析
优先级为 **事项显式 `color` > Subject 颜色 > Category 颜色**。
`color` 为 `null` 或 `"default"` 都表示「跟随分类 / 科目」——写入路径不会把当时的分类色
快照成事项的显式颜色，因此改分类或科目配色时旧数据会一起变。

### 独立课程层（migration 0013 / 0014）

#### `GET /api/course-schedule`

读取课程层的最终投影，不会返回 `events` 或 `deadlines`，也不会创建日历事项。

```text
GET /api/course-schedule?from=2026-09-14&to=2026-09-20
```

`from` / `to` 都是**必填**的 `YYYY-MM-DD`（含两端），`from > to`、格式不合法或缺失都返回
`400 validation_error`。没有覆盖该区间的 Term 时返回空数组。

投影行是按 Term / CourseSlot / Override 现算的，不落库：

| 字段 | 说明 |
|---|---|
| `id` | 稳定合成值 `course:<course_slot_id>:<date>`，同一节课每次请求都相同 |
| `date` | `YYYY-MM-DD` |
| `term_id` / `course_id` / `course_slot_id` | 来源行 ID；`course_slot_id` 是请假时要回传的那个 |
| `title` / `teacher` / `room` | 来自 Course / CourseSlot，`teacher`、`room` 可能为 `null` |
| `start_time` / `end_time` | `YYYY-MM-DDTHH:mm:00+08:00`（上海时间墙钟） |
| `subject_id` / `subject_name` / `color` | 来自 Academics Subject，`color` 即科目色 |
| `status` | 目前恒为 `"scheduled"` |

过滤规则：`weekday`（1=周一…7=周日）匹配日期；`week_pattern` 为 `odd` / `even` 时只在单
/ 双周出现（周序从 Term 的 `start_date` 起算，第一周为第 1 周）；`first_week` / `last_week`
限定起止周。**被请假的课程直接从结果中消失**，不会返回 `status: "cancelled"` 的行。
非 `active` 的 Course 或 Subject 一律不投影。

#### `POST /api/course-overrides`

Web 目前只允许两种请假操作：

```json
{ "kind": "cancel", "effective_date": "2026-09-14", "course_slot_id": "slot-id" }
{ "kind": "cancel_day", "effective_date": "2026-09-14" }
```

成功返回 `201`，body 是完整的 `course_overrides` 行（未使用的字段为 `null`）。
校验失败统一返回 `400 validation_error`：`kind` 不在两者之内、`effective_date` 不是合法
日期、该日期没有任何 Term 覆盖、`kind=cancel` 缺 `course_slot_id` 或该 slot 不存在。

其他 Override 类型（`makeup`、`move`、`add`）保留在数据模型中，但暂不开放 Web API。
**目前没有撤销请假的端点**（无 `DELETE /api/course-overrides/:id`），写错只能直接改 D1，
见 `BUGS.md` BUG-0006。

课程层完全独立：不写 `events` / `deadlines`，不产生提醒和通知，不进入 `/api/export`，
也不进入私有 ICS 订阅源（公开的 `/schedule.ics` 是另一套静态课表数据，与本层无关）。

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

### Apple Calendar ICS 订阅

订阅源是与 `/api` 分离的只读 HTTPS 地址，供 Apple Calendar 等不支持 Bearer Token 的客户端轮询。链接包含 `ICS_SUBSCRIPTION_TOKEN`，因此等同于只读访问密钥；不得公开、不得写入文档或日志。通过已认证网页的 **ICS** 按钮复制链接。

- 全部 Event：`GET /subscribe/:token/all.ics`
- 单个主分类：`GET /subscribe/:token/all.ics?category=:categoryId`
- 单个科目：`GET /subscribe/:token/all.ics?subject=:subjectId`
- 迁移 0012 归档的四个学科分类（`cat-math` / `cat-physics` / `cat-cs` / `cat-school`）
  仍然可用：它们会被重定向到同名 Subject 的事件，避免已经在 Apple 日历里订阅的
  分类日历在迁移后静默变空。
- 响应为 `text/calendar; charset=utf-8`。只包含未软删除的 Event，不包含 Deadline；定时 Event 统一转换为 UTC，全天 Event 使用 RFC 5545 date-only 形式。
- Tags 同时写入 `CATEGORIES` 与 `X-AI0506-TAGS`；Apple Calendar 订阅是只读的，tag 颜色和按 tag 筛选仍以本项目网页/Android 为准。
- Apple Calendar 对一个订阅日历只提供单一颜色。应按分类订阅，并由用户在 Apple Calendar 中为每个分类日历设置对应颜色。

订阅地址由 `GET /api/subscriptions` 在正常 Cookie/Bearer 鉴权后返回；该接口在 `ICS_SUBSCRIPTION_TOKEN` 未配置时返回 `503 not_configured`。

---

## Tags

Tags are global, optional labels on Events, Deadlines, and recurring Event Series. `category` remains a single primary classification. Each item accepts at most five unique `tag_ids`.

- `GET /api/tags` lists tags; `POST /api/tags` creates `{ name, color?, sort_order? }`.
- `GET`, `PUT`, and `DELETE /api/tags/:id` read, update, or delete a tag. Names are case-insensitively unique and cannot contain `|`; duplicate names return `409`. Delete returns `409` while an active item references the tag, otherwise clears historical links and category suggestions before deletion.
- `GET /api/category-tag-suggestions` returns `{ category_id: [tag_id] }`; `PUT /api/category-tag-suggestions/:categoryId` fully replaces one category's suggestion list.
- Event, Deadline, and Event Series create/update requests accept optional `tag_ids`. Responses include `tags: [{ id, name, color }]`. Series instances inherit the series tags; splitting a series copies them to the new series.
- Repeating `tag` query parameters on `GET /api/events` or `GET /api/deadlines` use AND semantics for MCP/agent server queries, for example `?tag=tag-exam&tag=tag-revision`. The Web UI filters already-loaded items locally using category OR tag OR semantics.
- Event import uses `tag_ids`: omitted preserves tags on an existing item (and uses none on a new item); `[]` clears them; a supplied array replaces them.
- Export includes tags in JSON and Markdown. CSV appends `tag_ids` and `tag_names` after its existing columns; each multi-value cell uses `|`.

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

MCP 工具名统一带 `calendar_` 前缀，用于和同时挂载的其他 MCP server 区分；不带前缀的旧名仍兼容，但 `tools/list` 只暴露新名。

Remote MCP `/mcp` 提供与上述 REST API 对应的单次 DDL 工具：

| 工具 | 作用 |
|---|---|
| `calendar_list_deadlines` | 按日期范围、分类和完成状态查询；不传日期时默认返回上海时间起未来 30 天 |
| `calendar_create_deadline` | 创建单次 DDL，`priority` 支持 `high` / `default` / `low` |
| `calendar_get_deadline` | 按 `id` 查询单个活动 DDL |
| `calendar_update` | 修改 event 或 DDL 字段，用 `type` 指定类型；`source` 和 `external_id` 不可修改 |
| `calendar_delete` | 软删除 event 或 DDL，用 `type` 指定类型 |
| `calendar_list_subjects` | 列出 Academics 的科目；写入学业事项时把返回的 `id` 放进 `subject_id`。默认只返回启用中的科目，`include_inactive` 可返回全部 |
| `calendar_complete_deadline` | 标记完成，重复调用幂等 |
| `calendar_reopen_deadline` | 重新打开，重复调用幂等 |

MCP 工具直接访问同一 D1 数据库，并复用 REST 的字段校验、优先级枚举、截止状态和软删除规则。

**Event 与 DDL 的工具划分**：`update` 与 `delete` 合并成一个工具、用 `type: "event" | "deadline"`
区分——这两类操作在两种对象上形状相同（必填都只有 `id`），合并不丢任何 schema 信息。
`create` **没有**合并：event 必填 `start_time`、deadline 必填 `due_time`，合并后 JSON Schema
的 `required` 只能退化成 `["title", "type"]`，时间字段会从必填掉出去，只能靠描述文字兜底，
代价大于收益。

`calendar_update` 中带【仅 type=…】标注的字段只对该类型有效（`start_time` / `end_time` /
`reminders` 仅 event，`due_time` / `priority` 仅 deadline），用错类型会在运行时被拒——
JSON Schema 表达不了这种条件约束，而服务端也不校验未声明的参数，所以这层保护是显式写的。

MCP 写工具**不提供 `color` 参数**：颜色由 category / subject 决定，见 §Category 与 Subject。

#### 写入归因（`last_modified_by`）

`events` / `deadlines` / `event_series` 三张表都有 `last_modified_by` 列（迁移 `0011_mcp_attribution.sql`），记录**最近一次通过 MCP 写入该行的客户端名**（OAuth 动态注册时客户端自报的 `client_name`，例如 `"Claude"`、`"ChatGPT"`）。任何读取到该行的接口（REST GET、MCP `list_*` / `get_*`）都会原样带出这个字段。

- 该字段只在 MCP 工具的写操作（create / update / delete / complete / reopen / skip / restore / split 等）中被写入；REST/网页端 cookie 登录的写入不经过这里，不会更新它。
- 值为 `null` 表示该行从未被 MCP 写过（网页手动创建，或早于本迁移的历史数据）。
- `client_name` 由客户端自报、未经服务端校验，仅用于单用户场景下的溯源参考，不是安全边界。

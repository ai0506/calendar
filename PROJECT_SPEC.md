# AI0506 Calendar — 项目规格 (PROJECT_SPEC)

## 1. 概述

AI0506 Calendar 是一个**私人**日历系统，用于管理个人学习、科研、考试、项目与生活安排。

- 替代目前不符合个人需求的日历工具
- 支持 Windows、Android 手机、Android 平板等设备
- 数据云端同步，多设备访问同一份数据
- 后续可扩展为 Android App
- 支持 AI agent 通过 API 管理日程

这是个人工具，不是公开 SaaS，**不需要**多用户 / 社交功能。

核心理念：**简单开始 → 稳定运行 → 逐步扩展。** 先完成第一阶段，不提前开发未来功能。

## 2. 技术架构要求

### 域名
- 正式访问入口：`calendar.ai0506.com`
- 暂不拆分 `api.calendar.ai0506.com` / `admin.calendar.ai0506.com`（除非未来规模扩大）。
- API 初期与网站同域：`calendar.ai0506.com/api/...`

### 部署
- **前端**：Cloudflare Pages（静态资源、前端页面）。
- **后端**：Cloudflare Pages Functions（登录验证、API、数据处理、Agent API）。
- **数据库**：Cloudflare D1（SQLite 语法，Serverless，与 Workers/Pages 集成）。
  - 数据库名称：`calendar-db`。
- D1 只存**结构化数据**（事件、设置、配置）。**不存**图片 / 视频 / 大文件；未来若需文件再考虑 Cloudflare R2。

### 架构图
```
                 Cloudflare D1
                      |
              Cloudflare (Pages Functions / API)
                      |
       ------------------------------
       |              |             |
   Web Website    Android App    AI Agent
```
所有客户端共享同一套 API。

## 3. 第一阶段范围 (Phase 1)

**当前交付：Backend + API + 文档 + Web 前端。** 原计划下一阶段完成的前端日历 UI 已提前实现并接入现有 API；Android / Flutter App 仍属于后续阶段。

必须实现：
- 登录保护（单一私人密码）
- 事件的创建 / 查看 / 编辑 / 删除
- 事件分类系统（颜色）
- 数据云端同步（D1）
- API（获取 / 创建 / 修改 / 删除 / 批量导入 / 导出）
- 重复事件系列（规则创建、实例查询、系列修改、except、split、单次/系列软删除）
- 基础项目文档

优先级：**稳定 > 简洁 > 易维护 > 可扩展**。不为未来功能过度设计。

### 当前完成度（2026-07-13）

- 后端核心 API：已完成（认证、事件 CRUD、重复系列、分类、导入导出、Deadline、通知）。
- Web 前端：已完成首版可用界面，支持日历视图、Event / Deadline 创建与编辑、详情、重复事件、通知和提醒配置。
- MCP：已提供日历、重复系列和 Deadline 操作工具。
- 自动化验证：Deadline、Reminder、系列 PATCH 回归测试通过；完整浏览器和部署验收仍需执行。
- 已知问题：软删除事件再次使用相同 `(source, external_id)` 导入仍待处理；本地 Wrangler compatibility date 有版本警告。

## 4. 数据模型

时间统一使用 **ISO 8601 带时区偏移** 格式（例如 `2026-07-14T19:00:00+08:00`），按客户端提交的偏移原样存储，不强制转 UTC。

### events
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID，由服务器生成 |
| title | TEXT NOT NULL | 标题 |
| description | TEXT | 描述 |
| start_time | TEXT NOT NULL | 开始时间，ISO 8601 带时区偏移 |
| end_time | TEXT | 结束时间，ISO 8601 带时区偏移 |
| all_day | INTEGER | 全天事件标记，0/1 |
| category | TEXT | 分类名称；必须是 `categories.name` 中已存在的值，服务端在写入前校验（非法值返回 `validation_error`），不允许调用方凭空创建分类名 |
| subject_id | TEXT | 科目 id（可选）；只有当 `category` 是 `kind = 'academics'` 的分类时才允许非空，见下方 subjects |
| color | TEXT | 事项显式颜色（可选）。NULL 表示跟随分类 / 科目颜色 —— 写入路径不会把当时的分类色快照进来 |
| group_title | TEXT | 分组标题 |
| source | TEXT | 来源，默认 `web`（`web` / `agent` / `import` 等） |
| external_id | TEXT | 外部唯一标识，用于导入去重 |
| series_id | TEXT | 所属重复事件系列；普通事件为 NULL |
| recurrence_index | INTEGER | 系列实例序号；首版预留，不参与业务计算 |
| original_start_time | TEXT | 实例原始开始时间；首版预留，不参与业务计算 |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |
| deleted_at | TEXT | 软删除时间戳，NULL 表示未删除 |

索引：
- `start_time`（日历视图范围查询）
- `series_id`（系列查询和系列软删除）
- **唯一** `(source, external_id)`（`external_id` 非空时）→ 保证 Agent 批量导入幂等，防止重复创建。

### categories
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| name | TEXT UNIQUE NOT NULL | 分类名 |
| color | TEXT NOT NULL | 颜色 |
| sort_order | INTEGER | 排序 |
| created_at | TEXT | 创建时间 |
| kind | TEXT NOT NULL | `normal` 或 `academics`；`academics` 是唯一拥有 Subject 子类的特殊分类 |
| archived | INTEGER NOT NULL | 1 表示历史分类：不再列出、不接受新写入，但保留行以便旧数据和旧订阅 URL 可读 |

当前分类：Academics（`kind = 'academics'`）/ Research / Projects / Leisure / Tech。
迁移 0012 之前，Math / Physics / CS / Other Subjects 是四个独立分类；它们已被合并进
Academics，原分类行标记为 `archived = 1` 保留。

### subjects
Subject 是 Academics 专属的子类（学科）。Category 表示「日程的组织范围」，
Subject 表示「学业事项属于哪一门科」，两者不再混用同一个字段。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 科目 id |
| name | TEXT UNIQUE NOT NULL | 科目名 |
| category_id | TEXT NOT NULL | 所属分类，必须是 `kind = 'academics'` 的分类 |
| color | TEXT NOT NULL | 科目颜色 |
| sort_order | INTEGER | 排序 |
| active | INTEGER NOT NULL | 0 表示停用：不再出现在选择器，但旧数据仍可读 |
| created_at / updated_at | TEXT | 时间戳 |

当前科目：Math / Physics / CS / English / Other Subjects。

**分类与科目的联动规则**（REST、MCP、Import 共用 `_lib/subjects.js` 的同一套校验）：

```text
category.kind = 'normal'                  → subject_id 必须为空
category.kind = 'academics' + subject_id  → subject 必须属于该分类且处于启用状态
category.kind = 'academics' + 无 subject  → 合法，表示学业但未指定科目
```

**颜色解析优先级**：事项显式 `color` > Subject 颜色 > Category 颜色。
`color` 为 NULL 或 `"default"` 都表示「跟随分类 / 科目」，因此改分类或科目配色时
旧数据会一起变色。写入路径不再把分类色快照成事项的显式颜色。

`category` 字段没有数据库外键约束，但 Event / Deadline / Event Series 的所有写路径（REST 与 MCP）都会在写入前校验 `category` 是否存在于 `categories.name` 且未归档，防止调用方（尤其是 AI Agent）凭空写入未注册的分类名。新增分类只能通过 `POST /api/categories`（暂无对应 MCP 工具）；新增科目通过 `POST /api/subjects`。Agent 应先用 `calendar_list_categories` / `calendar_list_subjects` 确认没有合适的现有项，再请用户通过网页端创建。

### event_series

重复规则保存在 `event_series`，实际显示的每次事件仍保存在 `events`，通过 `events.series_id` 关联。支持 daily / weekly / monthly / yearly，最大 366 个实例；系列创建、修改和 split 使用 D1 原子批次。

### event_exceptions 与 event_operations

`event_exceptions` 只记录重复系列中被跳过的 occurrence，使用 `(series_id, original_start_time)` 唯一定位；延期或替代事件不进入 exceptions，而是通过普通事件 API 单独创建。

`event_operations` 保存 PATCH/split 等多步变更的 `Idempotency-Key`、源 series、结果 series 和请求指纹，用于网络重试和并发冲突回查。系列修改会重新生成实例；第一版不保留此前对单个系列实例的直接修改。

### notifications（提醒）

`event_reminder_configs` / `event_series_reminder_configs` 保存 Event 的 custom 或 disabled 配置；无配置行表示默认提前 60 分钟和 10 分钟。`reminders` 保存每个 Event occurrence 或 Deadline 的实际计划，历史 cancelled/sent/skipped 行保留，只有 pending `(target_type, target_id, reminder_key)` 唯一。`notifications` 保存已经派发的站内通知，并以 `reminder_id` 去重。

Event 支持最多两个预设提醒；全天 Event 固定在上海时间当天 09:00 提醒。Deadline 根据 priority 自动生成提醒，完成/删除/改期会取消或重建尚未派发的计划。过期 Event 与过期的 Deadline 提前提醒不会补发；最终 due 提醒只保留 24 小时宽限，避免页面重新打开时通知集中轰炸。

浏览器页面打开时由前端轮询触发派发；首次轮询只把历史未读作为角标基线，不重新弹出。通知中心点击后会标记已读并打开对应 Event/Deadline。浏览器系统提示为独立、显式开启的可选渠道，仅在页面打开时工作；本阶段不承诺页面关闭后仍能推送。

### 未来表（本阶段不创建）
- `day_marks`（Days Matter 倒计时）
- `settings`（默认视图、默认颜色、时区）

## 5. 认证设计

两种**概念上分离**的机制，按客户端类型区分，便于各自独立演进：

- **浏览器 → Session Cookie**：`POST /api/auth/login` 校验密码（常量时间比较）成功后，下发 `httpOnly` + `Secure` + `SameSite=Lax` 的签名 Cookie（HMAC 签名，含过期时间）。密码永不写入前端、永不下发。
  - 私人单用户日历，采用**长期有效** Cookie（约 1 年），不使用短时过期。
  - 会话无服务端存储；**更换 `SESSION_SECRET` 即可使所有已签发 Cookie 立即失效**（签名校验不通过）。
- **Android/Flutter App + AI Agent → Bearer Token**：请求头 `Authorization: Bearer <API_TOKEN>`，常量时间比较。无状态，无需登录往返。
  - **Phase 1 仅一个 `API_TOKEN`**，暂不引入 token 管理表（`api_tokens`）。

`functions/_middleware.js` 是唯一的鉴权入口，保护 `/api/*`（登录接口除外）；接受有效 Cookie **或** 有效 Bearer Token，两条代码路径分离、各自记录。

### Category / Subject 是底层语义，不开放给 AI

Category 和 Subject 决定了 Event / Deadline 的组织方式与颜色解析，属于**底层数据语义**，
一旦被随手创建就会污染全局并很难回收。因此：

- **MCP 不提供**创建 / 修改 / 删除 Category 或 Subject 的工具，只提供只读的
  `calendar_list_categories` 与 `calendar_list_subjects`；
- 新增分类或科目只能由**本人在网页端**完成（`POST /api/categories` / `POST /api/subjects`，
  凭登录会话 Cookie）。

这条边界不是靠「没提供工具」维持的，而是鉴权层面的硬隔离：`isAuthenticated()`
只认 `API_TOKEN` 与签名会话 Cookie，**不认 OAuth access token**，而 MCP 走独立的
`/mcp` 端点 + OAuth 校验、不经过 `_middleware.js`。因此 MCP 客户端持有的凭证在
REST 侧根本不成立，拿 MCP token 打 `POST /api/subjects` 返回 401。

⚠️ 例外是 `API_TOKEN`：它是全权令牌，能过 `_middleware.js`，因而也能写 Category /
Subject。它是发给 Android / macOS 客户端的，**不要把它交给 AI Agent**——一旦交出，
这条边界即失效。

后续给 MCP 加工具时必须守住这条线：不要因为「AI 想建个科目」就开一个写工具。

### 密钥（环境变量，禁止硬编码 / 禁止提交 GitHub）
- `PASSWORD` — 私人登录密码
- `API_TOKEN` — Agent / App 访问令牌
- `SESSION_SECRET` — Cookie 签名密钥
- `ICS_SUBSCRIPTION_TOKEN` — Apple Calendar 只读订阅链接密钥；至少 32 个随机字符，轮换后旧订阅链接立即失效

本地放 `.dev.vars`（已 gitignore），生产放 Cloudflare Pages 环境变量。

## 6. 数据导出

`GET /api/export?format=json|csv|md`
- **JSON** — 程序处理
- **CSV** — Excel
- **Markdown** — 发送给 ChatGPT / Claude 分析

## 7. 开发规则

- 长期维护项目：小步修改，不无理由重写，不修改无关代码，修改前先理解现有结构，优先解决根本原因。
- 修改前先读：`PROJECT_SPEC.md` / `API_DOC.md` / `BUGS.md` / `CHANGELOG.md` / `updates.md`。
- 禁止：密码/API Key 写入代码；`.env` / `.dev.vars` 提交 GitHub；随意改数据库结构或 API 格式。
- 设计优先简洁、易维护、清晰；不为不存在的需求增加复杂系统，不过早优化，不加不必要依赖。

## 8. 第一阶段不做

多用户、社交、公开分享、复杂权限、AI 自动规划、聊天、复杂通知、过度复杂 UI 动画。

## 9. 后续规划（非本阶段）

Days Matter 倒计时、天气卡片、课表系统（独立的课程层，只读投影到日历视图，**不写入 events**，见 production/COURSE_SCHEDULE_PLAN.md）、Android App（Flutter，复用同一 API）。

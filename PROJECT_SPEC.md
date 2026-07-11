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

**本阶段交付：Backend + API + 文档。** 前端日历 UI（Vanilla JS + FullCalendar）放到下一阶段。

必须实现：
- 登录保护（单一私人密码）
- 事件的创建 / 查看 / 编辑 / 删除
- 事件分类系统（颜色）
- 数据云端同步（D1）
- API（获取 / 创建 / 修改 / 删除 / 批量导入 / 导出）
- 重复事件系列（规则创建、实例查询、系列修改、except、split、单次/系列软删除）
- 基础项目文档

优先级：**稳定 > 简洁 > 易维护 > 可扩展**。不为未来功能过度设计。

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
| category | TEXT | 分类名称 |
| color | TEXT | 颜色（覆盖分类默认色，可选） |
| group_title | TEXT | 分组标题（未来合并显示课程用） |
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

种子分类：Math / Physics / CS / Other Subjects / Research / Projects / Leisure / Tech，各配不同颜色。分类系统保持简单，方便以后扩展。

### event_series

重复规则保存在 `event_series`，实际显示的每次事件仍保存在 `events`，通过 `events.series_id` 关联。支持 daily / weekly / monthly / yearly，最大 366 个实例；系列创建、修改和 split 使用 D1 原子批次。

### event_exceptions 与 event_operations

`event_exceptions` 只记录重复系列中被跳过的 occurrence，使用 `(series_id, original_start_time)` 唯一定位；延期或替代事件不进入 exceptions，而是通过普通事件 API 单独创建。

`event_operations` 保存 PATCH/split 等多步变更的 `Idempotency-Key`、源 series、结果 series 和请求指纹，用于网络重试和并发冲突回查。系列修改会重新生成实例；第一版不保留此前对单个系列实例的直接修改。

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

### 密钥（环境变量，禁止硬编码 / 禁止提交 GitHub）
- `PASSWORD` — 私人登录密码
- `API_TOKEN` — Agent / App 访问令牌
- `SESSION_SECRET` — Cookie 签名密钥

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

Days Matter 倒计时、天气卡片、课表系统（自动生成学期课程、折叠显示）、Android App（Flutter，复用同一 API）。

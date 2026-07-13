# AI0506 Calendar — 变更日志 (CHANGELOG)

> 记录**正式版本**的变化。日常 AI agent 修改日志见 `updates.md`。
> 遵循 [Keep a Changelog](https://keepachangelog.com/) 风格，语义化版本。

## [Unreleased]

### 计划中
- Android / Flutter App
- 完整浏览器端到端测试与生产部署验收

### 已完成
- Web 首版日历 UI：事件与 Deadline 的月/周/日视图、创建与详情窗口、重复事件、优先级、分类颜色、通知入口和提醒配置。
- Notification Phase 1：D1 提醒配置、计划和站内通知表；Event 最多两个自定义提醒；DDL priority 提醒；Event/DDL/系列/import/MCP Event 生命周期接入；通知轮询与浏览器通知支持。
- 重复事件系列首版：规则创建、实例生成、幂等提交、系列查询、单次/系列软删除，以及 New Event Modal 内的 Repeat 配置。
- 项目文档初始化：PROJECT_SPEC / API_DOC / BUGS / CHANGELOG / TEST_CHECKLIST / updates
- Stage 2：项目脚手架（wrangler.toml / package.json / .gitignore / .dev.vars.example / public/index.html）
- Stage 3：数据库迁移 `migrations/0001_init.sql`（events / categories 表 + 索引 + 默认分类）
- Stage 4：认证（长期 httpOnly 签名 Cookie + Bearer Token，`_middleware.js` 保护 `/api/*`）
- Stage 5：events CRUD API（`GET/POST /api/events`、`GET/PUT/DELETE /api/events/:id`，软删除，参数化 SQL，`_lib/db.js` 与 `_lib/events.js`）
- **Stage 6：Backend 基础完成**
  - 分类 API：`GET/POST /api/categories`（按 sort_order/name 排序，名称唯一约束）
  - 批量导入 API：`POST /api/events/import`（按 `(source, external_id)` 幂等去重，返回 created/updated/skipped 统计）
  - 导出 API：`GET /api/export?format=json|csv|md`
  - Phase 1 后端基础（认证 + events CRUD + import + categories + export）全部完成
  - 后端事件修改 API：普通事件时间先后校验、重复系列 PATCH、单次 except、系列 split、event_operations 幂等和 event_exceptions 记录

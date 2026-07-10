# AI0506 Calendar — 变更日志 (CHANGELOG)

> 记录**正式版本**的变化。日常 AI agent 修改日志见 `updates.md`。
> 遵循 [Keep a Changelog](https://keepachangelog.com/) 风格，语义化版本。

## [Unreleased]

### 计划中 (Phase 1)
- Cloudflare Pages Functions + D1 后端脚手架
- `events` / `categories` 数据表与迁移
- 单密码登录（浏览器 Session Cookie）+ Bearer Token（App/Agent）
- 事件 CRUD API（软删除）
- 批量导入（按 `(source, external_id)` 幂等去重）
- 分类读取/创建 API
- 导出 API（JSON / CSV / Markdown）

### 已完成
- 项目文档初始化：PROJECT_SPEC / API_DOC / BUGS / CHANGELOG / TEST_CHECKLIST / updates
- Stage 2：项目脚手架（wrangler.toml / package.json / .gitignore / .dev.vars.example / public/index.html）
- Stage 3：数据库迁移 `migrations/0001_init.sql`（events / categories 表 + 索引 + 默认分类）
- Stage 4：认证（长期 httpOnly 签名 Cookie + Bearer Token，`_middleware.js` 保护 `/api/*`）
- Stage 5：events CRUD API（`GET/POST /api/events`、`GET/PUT/DELETE /api/events/:id`，软删除，参数化 SQL，`_lib/db.js` 与 `_lib/events.js`）

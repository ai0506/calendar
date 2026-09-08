# AI0506 Calendar — 变更日志 (CHANGELOG)

> 记录**正式版本**的变化。日常 AI agent 修改日志见 `updates.md`。
> 遵循 [Keep a Changelog](https://keepachangelog.com/) 风格，语义化版本。

## [Unreleased]

### Added
- Academics 特殊分类与 Subject 子类：Math / Physics / CS / Other Subjects 四个旧学科分类合并成 `Academics`，学科下沉为它专属的 Subject（Math / Physics / CS / English / Other Subjects）。Event / Deadline / Event Series 新增 `subject_id`，新增 `GET|POST /api/subjects` 与 MCP `calendar_list_subjects`，Web 端在选中 Academics 时才展开科目色块，侧栏筛选按科目细分，ICS 新增按科目订阅。见 migration `0012_academics_subjects.sql`。
- Private Apple Calendar ICS subscriptions for all Events and each primary category, with stable recurring-occurrence UIDs, tag metadata, and an authenticated Web copy-link panel.
- Tags for Events, Deadlines, and recurring Event Series, including category-based suggestions, Web/Android selection UI, import/export, and MCP query/write support.
- Web notification center upgrade: historical unread items no longer replay on login, browser-alert permission is explicit, notification rows open their Event/Deadline, scheduled reminder time is shown, and stale reminder backlogs are suppressed.

### Changed
- 颜色语义改为「跟随分类 / 科目」：写入路径不再把当时的分类色快照进事项的 `color`，优先级为 事项显式颜色 > Subject 颜色 > Category 颜色。迁移 0012 会把历史数据里等于所属分类色的 `color` 归一化成 `NULL`（原值保存在 `migration_0012_backup`，回滚脚本见 `migrations/README_rollback_0012.md`）。此前 Web 与 MCP 都会把分类色写死进每一行，导致改分类配色对旧数据不生效。
- 两级配色：普通分类（Research #7f5fb5 / Projects #c07043 / Leisure #bd5f86 / Tech #64748b）降饱和退到背景，Academics 的科目改用 Apple 系统色板（Math #ff3b30 / Physics #32ade6 / CS #30b855 / English #ff9f0a / Other Subjects #0a84ff）跳出来，与 /schedule 课表页的配色同源；Academics 自身取深中性 #655f58。「淡」实现为降饱和而非提高明度 —— 事项文字色由分类/科目色算出（74% 色 + 26% 主文字色），调浅会让浅色主题下的标签对比度不足。四个分类之间的 CIELAB 最小色差保持在 38.9，避免降饱和后彼此难以分辨。已知取舍：Apple 亮色在浅色主题下文字对比度偏低（English 3.1、CS 3.7、Physics 3.6），为配色评审时明确选定的结果。
- 归档分类（Math / Physics / CS / Other Subjects）不再出现在 `GET /api/categories` 与 `calendar_list_categories`，也不接受新写入；已被 Apple 日历订阅的这四个分类 ICS feed 会自动重定向到同名 Subject，不会静默变空。
- MCP 工具名统一加 `calendar_` 前缀（如 `calendar_list_events`），避免与同时挂载的其他 MCP server（Cloudflare 等）工具混淆。旧的无前缀工具名仍被服务端接受并透明映射，`tools/list` 只暴露新名。

### Fixed
- `POST /api/deadlines` 引用了未定义的 `id` 变量，创建 Deadline 时必定抛 `ReferenceError`（Web 端走的是同一端点）。改为 `deadline.id`。
- 0003 迁移把 `Personal` 改名为 `Leisure` 时只更新了 `events`，`deadlines` 里的残留分类名在 0012 中一并修正。
- Event / Deadline / Event Series 的所有写路径（REST 与 MCP）现在会校验 `category` 是否已存在于 `categories` 表，非法分类名统一返回 `validation_error`（批量导入中计入 `skipped`）。此前 `category` 无任何约束，AI Agent 曾借此凭空写入一个未注册的分类名（`UXR课程`），导致该事件无法匹配任何 `categories` 行、拿不到分类颜色。见 `BUGS.md` BUG-0005。

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

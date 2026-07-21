[Codex][260712002611] Fixed MCP and REST recurring-series partial-update merging by sharing a stored-row merge helper; omitted fields now retain category, color, metadata, and recurrence values, null remains an explicit clear, malformed weekdays JSON is safe, and MCP series updates now validate temporal ordering. Added regression tests and checklist coverage.
[ClaudeCode][260710134517] 初始化 Phase 1 项目文档：创建 PROJECT_SPEC.md、API_DOC.md、BUGS.md、CHANGELOG.md、TEST_CHECKLIST.md、updates.md（未写后端代码）
[ClaudeCode][260710134736] 创建项目级 CLAUDE.md，写入 Update Logging 规则、项目文档清单与开发规则
[ClaudeCode][260710135041] Stage 1 完成确认：Phase 1 项目文档齐备（PROJECT_SPEC/API_DOC/BUGS/CHANGELOG/TEST_CHECKLIST/updates），等待用户确认后进入 Stage 2（脚手架 + 迁移）
[ClaudeCode][260710135429] Stage 2 完成：创建项目脚手架 wrangler.toml、package.json、.gitignore、.dev.vars.example、public/index.html（未含 migration，未实现 API）
[ClaudeCode][260710135621] Stage 3 完成：创建 migrations/0001_init.sql（events 表、categories 表、索引、8 个默认分类种子；未实现 API/auth）
[ClaudeCode][260710140042] Stage 4 完成：实现认证。新增 _lib/response.js、_lib/auth.js、_middleware.js、api/auth/{login,logout,status}.js；采用长期有效(约1年)httpOnly+Secure+SameSite=Lax 签名 Cookie，可通过更换 SESSION_SECRET 使全部会话失效；同步更新 PROJECT_SPEC §5（未实现 events API）
[ClaudeCode][260710140442] Implemented Stage 5 events CRUD API. 新增 _lib/db.js、_lib/events.js、api/events/index.js、api/events/[id].js；GET/POST /api/events 与 GET/PUT/DELETE /api/events/:id（软删除、参数化 SQL、保留时区偏移）；更新 API_DOC.md 与 CHANGELOG.md；node --check 语法校验通过
[ClaudeCode][260710141241] Local CRUD test of Stage 5 events API completed via wrangler --local (npm install, db:local migration, pages dev). All 8 scenarios passed: auth middleware, bearer token access, POST/GET/PUT/DELETE, soft-delete persistence, timezone-offset preservation. No code bugs found; code unchanged.
[ClaudeCode][260710141810] Connected local project to GitHub repo https://github.com/ai0506/calendar. git init, verified .dev.vars/.env/node_modules/.wrangler are gitignored, staged tracked project files, created initial commit 6b07cfc "Initial AI0506 Calendar backend foundation", added remote origin, renamed branch to main, pushed to origin/main.
[ClaudeCode][260710142616] Implemented Stage 6 import export categories API.
[ClaudeCode][260710142854] Committed and pushed Stage 6 (7243959) to origin/main. Created DEPLOY_CHECKLIST.md (Cloudflare production deployment checklist only, no resources created, no deployment executed).
[ClaudeCode][260710144940] Cloudflare production D1 setup: authenticated via wrangler login (benjaminai0506@outlook.com), created production D1 database calendar-db (id e5d18701-8319-4a8a-a544-b83acbb2bda0), updated wrangler.toml database_id, applied migrations/0001_init.sql to --remote (8 commands, verified events/categories tables + 8 seed categories present, events table empty). No deployment executed, no application code changed.
[Codex][260710153137] Phase 1 closeout: fixed localhost session cookie handling while preserving Secure cookies for production domains; updated BUGS.md and TEST_CHECKLIST.md with current backend test status and documented import re-run after soft-delete external_id issue without changing schema.
[ClaudeCode][260710154707] Phase 2 UI exploration: created ui-preview/ with 3 static HTML design directions (design-a Apple Calendar style, design-b Notion knowledge-system style, design-c Google Calendar Pro time-grid style) using mock data; no backend/API/schema touched.
[ClaudeCode][260710160646] Phase 2 UI exploration: developed 3 fully-interactive divergent variants of the chosen Apple-style direction (design-a-a Pure Minimal fullscreen no-sidebar, design-a-b Frosted Sidebar with macOS vibrancy, design-a-c Split Inspector with live day-agenda panel). All support real Month/Week/Day switching with functional time-axis timelines, working prev/next/Today navigation, category filter toggling, and a centered Apple-style New Event modal that appends events into the in-memory mock dataset (no persistence/backend). Verified via local static preview server, no console errors.
[ClaudeCode][260710163421] Fixed 4 UX issues in design-a-c.html (chosen Split Inspector direction): (1) day selection no longer rebuilds the entire month grid, only toggles the is-selected class, fixing perceived jank; (2) All-day checkbox now dims/disables the time fields instead of hiding them, so the modal no longer resizes/jumps; (3) added an interval-partitioning layout algorithm so overlapping same-day events render side-by-side in Week/Day timelines instead of stacking invisibly, with new overlap demo data on Jul 10 and Jul 16; (4) added start/end time validation that blocks event creation and shows an inline error when end time is not after start time.
[ClaudeCode][260710164221] Further UX fixes on design-a-c.html: (1) the time-validation error text was still causing modal height jump because the row was display:none by default - reserved a fixed-height slot and toggle via opacity instead; (2) removed backdrop-filter blur on the New Event modal scrim, which was forcing a full re-blur of the 42-cell month grid behind it on every repaint and caused the perceived delay when clicking category color swatches; (3) added a delete (x) button on every event, both in the day-inspector agenda list and on Week/Day timeline blocks, wired to a shared confirm dialog (Cancel/Delete) before removing the event from the in-memory mock dataset.
[ClaudeCode][260710230843] Fixed all-day events showing no text in Week/Day view of design-a-c.html: all-day events (start 00:00, end 23:59) were positioned at top:-420px in the hourly grid (since GRID_START_HOUR is 7 AM), scrolling their title text off-screen while only a sliver of the color bled into view. Added a dedicated all-day banner row above the hourly grid (buildAllDayRowHTML) that renders all-day events as chips with visible title and delete button, and excluded them from the timed-hour layout algorithm.
[ClaudeCode][260710232206] Added aspect-ratio-driven portrait mode to design-a-c.html: when viewport width/height ratio < 1.35 (anything not clearly landscape, regardless of device) the layout switches to a stacked portrait view - compact month grid on top (all days with brief event marks) and the selected/current day detail below. Switch is live on window resize. Provided 3 portrait style variants via a segmented control: Dots (iOS-style colored dots + agenda), Timeline (dots + real hour timeline reusing the day grid), Bars (colored density bars + agenda). Refactored agenda item into shared agendaItemHTML helper (also now shows All-day label).
[ClaudeCode][260710233159] design-a-c.html: (1) added an in-progress/"now" marker for events currently within their time range (mock now = 13:45 on TODAY via NOW_MIN + isOngoing helper) - shown in both orientations: red pulsing ring + inline NOW badge on Week/Day/portrait-timeline blocks, a red "Now" badge in agenda lists (landscape inspector + portrait dots), and a red outline on landscape month chips; month chips now sorted by start time; added a demo ongoing event (Revision focus block 13:30-15:00) and prefers-reduced-motion fallback. (2) Fixed portrait month-switch jitter: nav-title had min-width:0 so the next-month arrow and Today button shifted as month-name length changed - gave the portrait title a fixed 150px centered slot (fits September 2026 without clipping) so the arrows/Today stay put. Dots remains the default portrait style.
[ClaudeCode][260710234150] design-a-c.html portrait restructure: (1) made all buttons/clickable controls non-selectable (user-select:none on button, nav-arrow, today-pill, inspector-add, cat-item, day cells, event chips). (2) Removed the Bars month layout entirely (pm-bars/pm-bar CSS + JS branch) so the portrait top half is always Dots. (3) Removed the top Dots/Timeline/Bars switcher bar; moved the mode switch into the bottom section as a Preview/Timeline tab (portraitTab state, setPortraitTab) - Preview = the agenda list (former dots/bars bottom half), Timeline = the hour timeline. Default tab is Preview.
[ClaudeCode][260710234941] design-a-c.html portrait detail polish: fixed layout jump when switching Preview/Timeline. Root cause: in Preview the inspector itself scrolled (outer scrollbar) but in Timeline the inner time-scroll scrolled, so the outer scrollbar appeared/disappeared and shifted the header/count. Now the inspector never scrolls (overflow:hidden); the header (date + count) and the Preview/Timeline tabs are pinned, and scrolling always happens in an inner region (pd-scroll for Preview with scrollbar-gutter:stable, time-scroll for Timeline). Also made the tabs compact and moved them into the header row (right side) instead of a full-width row, and merged the event count into the eyebrow (Today . N events). Verified header geometry is byte-identical across tab switches.
[ClaudeCode][260711000148] design-a-c.html: portrait detail eyebrow now uses 3-letter weekday abbreviations (MON/TUE/WED) inside a fixed-width slot (.pd-dow, min-width 2.8em), so the ". N events" text starts at the same x for every day (verified weekday-slot right edge = 48.8px across Wed/Sun/Thu/Fri/Mon) - no more horizontal drift when browsing days; dropped the special "Today" word in the eyebrow for width consistency (today still marked by the blue circle in the grid). Cleanup: deleted redundant preview files (design-a.html, design-b.html, design-c.html, design-a-a.html, design-a-b.html), keeping only the chosen design-a-c.html. Docs: added FRONTEND_SPEC.md summarizing the frontend UI requirements (visual direction + the overarching no-jitter/stability principle + layout/responsive/event/form rules) and referenced it from CLAUDE.md project docs list.
[Codex][260711002005] Implemented production frontend from design-a-c template: replaced public/index.html with app shell/login/event modals, added public/styles.css for Apple-style calendar UI, added public/app.js for cookie auth, categories/events API loading, create/delete events, 10-second visible-range refresh, real current-time markers, and state-preserving responsive rendering.
[Codex][260711003200] Fixed portrait frontend visual regression by clearing default button styling on portrait date cells and making Add event fill the detail panel width, restoring the design-a-c dots calendar look.
[Codex][260711003522] Reduced login screen typing lag by hiding unauthenticated calendar layout from rendering and removing the full-screen backdrop blur from the password screen.
[Codex][260711114941] Added production/RECURRING_EVENTS_PLAN.md covering custom repeat-rule event creation, modal interaction, series data model, APIs, edge cases, phased implementation, and acceptance criteria.
[Codex][260711004705] Improved portrait mobile layout for real browser viewports by using dynamic viewport height and compacting the calendar/header/detail spacing on shorter screens while keeping the normal 390x844 layout close to the design-a-c prototype.
[Codex][260711114738] Created production folder for non-project process artifacts, moved FRONTEND_SPEC.md and ui-preview into it, and added production/ to .gitignore.
[ClaudeCode][260711115501] 在 RECURRING_EVENTS_PLAN.md 末尾追加"Claude code的评价："章节，记录与现有代码对照后的评估与修正建议
[Codex][260711172708] 新增 production/RECURRING_EVENTS_IMPLEMENTATION_PLAN.md，按当前项目实际结构重写重复事件系列的首版范围、数据模型、API、时间规则、实施顺序和验收标准。
[Codex][260711173907] 根据评审意见补强重复事件实施计划：明确幂等查询与并发冲突二次读回、系列删除 batch、Modal 展开高度策略、预留字段语义及固定偏移不处理 DST 的首版约束。
[Codex][260711174455] 根据第二轮评审修订重复事件实施计划：统一每周空 weekdays 规则、补充无结束条件和计算候选上限、明确 ISO 日期字符串运算、移除重复时区字段、增加 series_id 索引、明确幂等键生成及精简创建响应。
[Codex][260711175015] 补充重复事件计划对纯日期全天事件的处理：要求日期格式与 all_day 一致、保持纯日期实例格式，并将 import.js 软删除复活风险明确为独立后续修复项。
[Codex][260711175442] 补充每年重复规则：明确闰年 2 月 29 日在非闰年跳过、不改为 2 月 28 日或 3 月 1 日，并加入对应验收标准。
[Codex][260711181445] 实施重复事件系列首版：新增 0002 迁移、event_series API、日期规则计算与 D1 batch 幂等写入，接入 New Event Repeat 表单、预览、系列标记和单次/系列删除，并更新 API/项目/测试/变更文档。
[ClaudeCode][260711175724] 在 CLAUDE.md 和 AGENTS.md 中新增 `production/` 文件夹说明：用途（生产过程中的计划草稿、多方案待选文件等暂时性文件）、已被 .gitignore 排除、禁止用 git diff/log/status 判断其变化，需直接重读磁盘文件
[Codex][260711184348] Rewrote the default categories to Math, Physics, CS, Other Subjects, Research, Projects, Leisure, and Tech; added migrations to rename existing event categories, reorder them, and remove nonstandard categories; updated project docs and frontend fallback category.
[Codex][260711201134] Created the personal calendar skill at C:\Users\asw\.codex\skills\calendar with production API instructions, category guidance, API references, and a PowerShell wrapper that reads CALENDAR_API_TOKEN.
[Codex][260711201134] Fixed the calendar skill PowerShell wrapper to send the Accept value through request headers for Windows PowerShell compatibility.
[Codex][260711201134] Configured the calendar skill to read CALENDAR_API_TOKEN from the user-local C:\Users\asw\.codex\calendar.env file and removed reliance on the system environment variable.
[Codex][260711201134] Documented recurring-series split usage, one-off exception usage, weekday numbering, confirmation requirements, and the current exception API limitation in the calendar skill.
[Codex][260711201134] Enforced UTF-8 handling for calendar writes: PowerShell now sends explicit UTF-8 JSON bytes with charset=utf-8, and the skill requires read-back verification for Chinese text.
[ClaudeCode][260711191018] Cache fetched event ranges and prefetch adjacent months to reduce blank flash on month navigation; fix left-clipped focus outline in event modal form fields (missing left padding on scrollable containers); auto-scroll time/repeat validation errors into view when they first appear.
[Codex][260711192942] 新增 production/EVENT_EDITING_API_PLAN.md，整理普通事件修改、仅跳过一次的 except、规则分段 split、系列修改 API、数据校验与事务边界；未修改业务代码。
[Codex][260711193100] 根据审查意见修订 EVENT_EDITING_API_PLAN.md：except 改为复用 generateInstances，补充 split 的新幂等键、旧实例清理和 occurrence_count 限制，明确时间校验兼容性与系列重建丢失实例级修改的副作用，并加入 exceptions 返回与错误码登记要求。
[Codex][260711193512] 根据第二轮交互审查修订 EVENT_EDITING_API_PLAN.md：split 迁移后续 exceptions，补充 split/PATCH 的 Idempotency-Key 重试语义，统一 exception 为硬删除，并清理 PATCH 后不再匹配新规则的 exceptions。
[Codex][260711193728] 根据第三轮交互审查修订 EVENT_EDITING_API_PLAN.md：明确 split 使用新 series 的 event_series.idempotency_key，PATCH 使用 event_operations 持久化幂等键与请求指纹，补充重试冲突处理及 body/header 幂等键约定。
[Codex][260711193945] 进一步统一 split 与 PATCH 的幂等实现：两者均使用 event_operations 保存操作 key、源 series 和请求指纹，新 series 保留独立的内部 idempotency_key，避免同一 key 无法校验不同 split 参数的问题。
[Codex][260711194210] 根据第四轮交互审查修订 EVENT_EDITING_API_PLAN.md：将 event_operations 明确拆分为 source_series_id/result_series_id，补充 PATCH 响应合同，并规定并发幂等键冲突按现有创建接口模式回查已有 operation。
[Codex][260711194325] 修正文档中 split 幂等记录的字段描述：Idempotency-Key 作为 operation 主键，source_series_id/result_series_id 保存源与结果 series，避免把操作键误写成 series 字段。
[Codex][260711195102] 按 EVENT_EDITING_API_PLAN.md 实现后端事件修改能力：新增 0005 event_exceptions/event_operations 迁移、except、系列 PATCH、split、幂等与并发回查、时间先后校验；更新 API_DOC/TEST_CHECKLIST/CHANGELOG；完成本地 API 冒烟验证。
[ClaudeCode][260711204054] fix: add CJK fonts (PingFang SC/Microsoft YaHei/Noto Sans CJK etc.) to body font-family stack in styles.css to fix Chinese tofu-box rendering
[Codex][260711205208] 修复事件分类改为新分类时颜色未同步：PUT 和批量导入在未显式提供 color 时自动使用分类颜色，同时保留显式自定义颜色。
[Codex][260711205427] 支持事件颜色填写 default：渲染时使用所属分类颜色，批量导入将 default 归一为跟随分类颜色，并保留自定义颜色。
[Codex][260711205434] 加强 default 颜色值的前端类型判断，避免异常数据导致渲染报错。
[ClaudeCode][260711224054] 新增 functions/mcp/index.js：最小版 MCP Streamable HTTP 端点，实现 initialize/tools/list/tools/call，仅暴露只读工具 list_events，无认证（阶段1）
[ClaudeCode][260711224609] MCP阶段2：新增工具 list_categories(公开)、create_event/update_event/delete_event(需 Bearer MCP_WRITE_TOKEN，fail-closed)，镜像现有REST逻辑含分类颜色继承；.dev.vars(.example) 增加 MCP_WRITE_TOKEN；未改动现有REST API
[ClaudeCode][260711225823] 实现完整 OAuth 2.1+PKCE 让 /mcp 可作 Claude Custom Connector：新增 _lib/oauth.js、.well-known/oauth-{protected-resource,authorization-server}.js、oauth/{register,authorize,token}.js、migration 0006_oauth.sql（clients/codes/refresh_tokens）；/mcp 改为统一要求有效 OAuth access token(aud 绑定)，MCP_WRITE_TOKEN 降级为本地调试旁路；严格校验 redirect_uri/state/PKCE/code 单次使用与过期/token 过期与 audience；新增 MCP_DEPLOY.md；本地 30 项端到端测试全部通过，REST API 不受影响
[ClaudeCode][260711230743] 部署 MCP OAuth 到生产：远程 D1 应用 0005+0006 迁移(建 oauth_clients/codes/refresh_tokens)；修正 wrangler.toml 项目名 ai0506-calendar→calendar；wrangler pages deploy 到 calendar 项目 main 分支；线上验证 .well-known 两个元数据、/mcp 未认证 401、DCR 注册、授权页渲染、token 端点(SESSION_SECRET 已配置)均正常；清理探测数据
[ClaudeCode][260711232430] MCP 新增重复事件工具 create/get/update/delete_event_series（复用 recurrence.js/series.js，支持 daily/weekly/monthly/yearly，自动派生 start_date 与 monthly_day，MCP 层自动生成 idempotency_key）；工具增至 9 个；refresh token 有效期 30 天→1 年（轮换重置，保持使用即永不重新授权）；本地 21 项测试全通过
[ClaudeCode][260711233456] MCP 新增 skip_occurrence/restore_occurrence/split_series（复用 exceptions/split 逻辑，split 跳过 event_operations 幂等表），工具增至 12；工具描述优先推荐 skip/split 而非整体改/删；颜色支持 "default"（跟随分类色）：create/update event 与 series 均解析，字段说明已更新；本地 22 项测试全通过
[Codex][260712000944] Added production/DEADLINES_PLAN.md defining the first-version single Deadline model, shared categories with events, database migration, REST API, frontend rendering, validation rules, implementation phases, and explicit non-goals for recurring deadlines.
[Codex][260712001807] Revised production/DEADLINES_PLAN.md after compatibility review: fixed date-based deadline range queries and Asia/Shanghai all-day semantics, added explicit Pages Functions routes and idempotent state-transition rules, preserved legacy exports, closed external_id conflict behavior, aligned frontend caching/rendering with the custom app, and deferred import/MCP extensions.
[Codex][260712002343] Refined the Deadline implementation plan with target-state conditional UPDATE SQL for complete/reopen, frontend render-time status recomputation, julianday-based timezone-aware ordering, strict calendar/date-time validation, explicit include_completed parsing, completed-overdue semantics, a matching due-date expression index, and complete project documentation sync requirements.
[Codex][260712002714] Corrected the Deadline plan's frontend DTO to retain completedAt, made the D1 expression index a required migration assumption with an explicit success test, normalized blank external IDs to NULL, and clarified that deleted is internal-only and never exposed by list/detail APIs.
[Codex][260712003642] Added production/ui-preview/feedback-preview.html, a standalone static calendar preview for the requested stronger +more entry, full-title hover, denser day cards, emphasized Today panel, and raised Categories area without changing production frontend code.
[Codex][260712004015] Reworked feedback-preview.html to use the production index structure and public/styles.css as its visual base, keeping only static data and preview-only CSS/JS overrides for the requested frontend refinements.
[Codex][260712003802] Implemented Deadline backend Phase 1/2: added migration 0007 with date expression index, shared strict temporal validation, single-deadline REST CRUD and complete/reopen routes, dynamic status derivation, external ID normalization/conflict handling, unit tests, API/project/deployment/MCP documentation, and local D1/API smoke verification. Frontend, import, export extension, and MCP tools were intentionally not implemented.
[Codex][260712003834] Tightened Deadline validation so blank categories are rejected while blank source defaults to web and blank external_id remains NULL; reran deadline and recurring-series regression tests successfully.
[Codex][260712010500] Added three interactive static DDL frontend previews under production/ui-preview, reusing public/styles.css with test events, deadline states, category filters, navigation, and complete/reopen interactions; production frontend files unchanged.
[Codex][260712010512] Verified all three DDL preview files parse successfully and serve over a local static HTTP server; removed the temporary browser-test script because Playwright is not installed in the environment.
[Codex][260712011200] Added ddl-preview-interactive.html based on design-a-c: preserved Event month/week/day timeline interactions and added DDL as a parallel layer in month cells, all-day rows, inspector, portrait preview, and complete/reopen controls.
[Codex][260712011430] Rebuilt ddl-preview-a/b/c as three complete design-a-c-based previews with standard HTML structure, preserved Event interactions, parallel DDL rendering, and distinct visual treatments; verified all three files over local HTTP.
[Codex][260712011620] Copied the three DDL previews into the accessible root ui-preview directory, corrected the public stylesheet paths, added a preview index page, and verified all entries plus styles.css return HTTP 200.
[Codex][260712011735] Fixed the blank preview initialization error by declaring the selected-day deadlines collection in renderInspector for all three accessible previews.
[Codex][260712011820] Fixed the blank-page visual issue caused by public/styles.css hiding unauthenticated preview bodies; added is-authenticated to all three root previews and verified the rendered calendar with Chrome headless screenshot.
[ClaudeCode][260712094147] ui-preview: 重建 ddl-preview-a/b/c 三套静态预览，日历/事件功能保持不变，deadline 分别用内联融合(Inline Layer)、倒计时看板(Countdown Board)、贴底任务坞(Task Dock)三种方式集成；替换 prompt 为正式弹窗/内联交互，补全测试数据与新建/完成/重开/删除/过滤交互；更新 index.html 说明
[ClaudeCode][260712100758] ui-preview: 三套预览按反馈迭代——共性：月视图条目折叠(超出用+more)点击弹浮层展示当天全部ddl+事件、reopen 增加二次确认弹窗、周/日timeline事件块点击弹浮层看完整信息(浮层覆盖不挤动布局)；B：ddl卡片分类与due date改两行、事件区回到可见(看板限高滚动移到事件下方)；C：移除quick add改为New弹窗、任务坞固定高度消除切tab/空状态时的跳动
[Codex][260712101925] Added DDL-only priority with high/default/low validation, default database migration 0008, REST create/update support, tests, and synchronized project deployment/API documentation; events remain unchanged.
[ClaudeCode][260712104526] ui-preview 三套按反馈迭代v3：New Event/New DDL 合并为单个 New 按钮(弹窗内 Event/Deadline 双 Tab 切换)；DDL 新增 priority 字段(high/default/low, 对齐后端 migration 0008)；右侧快捷展示按优先级时间窗过滤(high 72h/default 48h/low 24h, 逾期同窗后隐藏)并按优先级→due 排序(A 的 Deadlines 栏、B 的看板)，C 任务坞按优先级排序并加 priority 标签；月视图改为按像素测量裁剪并动态注入 +more(修复矮格子溢出却无 more)；overdue 改为按 due 派生, complete/reopen 用 done 字段, 修复 reopen 后 overdue 标签丢失与尺寸跳变(meta 单行 nowrap)
[ClaudeCode][260712213440] 归位：将三套 preview(ddl-preview-a/b/c.html + index.html)移入 production/ui-preview/(覆盖旧版, 保留 design-a-c.html/feedback-preview.html)；样式表引用改为 ../../public/styles.css；删除根目录误建的 ui-preview/ 及其中自动生成的杂散 updates.md（日志统一只写项目根 updates.md）
[ClaudeCode][260712213627] 优化 CLAUDE.md：明确 updates.md 仅根目录一个(禁止嵌套/子目录版本, 说明 hook 回退行)；production 节新增“所有 scratch/preview/draft 放 production 下、不建在仓库根, ui-preview 指 production/ui-preview, 根目录出现未跟踪 ui-preview 即放错位置”；修正 FRONTEND_SPEC 引用路径为 production/ui-preview/design-a-c.html
[ClaudeCode][260712220410] production/ui-preview 三套按反馈迭代v4：优先级标签改为跟随 DDL 自身颜色+字重/透明度(High 粗体/Default 常规/Low 降透明,不再用红蓝灰专属色);B 卡片优先级换行避免挤压分类名;右侧/底部预览的相对时间与顶部 relative to MM.DD 均按选中日重算(今天不显示, 时间窗筛选仍按现在);Mark complete 增加二次确认弹窗;月视图三套都显示 DDL 标题 chip(带 ⚑), 周/日 timeline 定时 DDL 画虚线到期线(分类色+旗帜标签, 区别于红色 now 线)、全天 DDL 回到 all-day 行;修复 C 的 dock 未随选中日重渲染
[ClaudeCode][260712222928] production/ui-preview 三套迭代v5：(1)合并 New 弹窗字段区固定高度包裹, 切 Event/Deadline tab 弹窗尺寸与按钮不再移动;(2)右侧预览窗口改为"距选中日 ±3/2/1 天(按 high/default/low)", 随选日变化;(3)days left/late 去掉紫红专属色, 统一用该 DDL 分类色(B 看板数字+进度条、A 右栏、C 到期文字), late 加 ⚠ 危险字符;(4)timeline 到期线一律用分类色(不再红, 与红色 now 线区分), 时间接近的到期线标签聚类向上错开堆叠;(5)C 底部坞的 relative-to 注记改为固定预留位, 切日期时 All/Open 等 tab 不再移动
[ClaudeCode][260712223249] 选定方案 A：将 ddl-preview-b/c.html 重命名为 ddl-preview-b/c-已弃用.html, index.html 标注 A 为采用、B/C 已弃用并更新链接
[Codex][260712224633] 优化 MCP 为用户主日历：initialize 增加 AI 使用指引，list_events 默认查询上海时间未来 30 天，系列工具统一优先使用 series_id 并兼容旧 id，补充删除/重复系列/严格输入使用文档；未修改 Deadline MCP 工具范围。
[Codex][260712224929] 修改 production/ui-preview/ddl-preview-a.html：DDL 颜色优先使用自身 color 字段并在 default 时回退分类色；右侧预览限制 3 项并支持 +n more 浮层查看；标题增加悬停完整提示；统一创建按钮为 Create；压缩逾期文案并改用分钟/小时相对时间。
[Codex][260712225408] 调整 ddl-preview-a：右侧 DDL 的相对时间与分类改为分两行；逾期 DDL 使用更浅的半透明分类背景；时间线近距离/重合 DDL 标签增加最大宽度、悬停完整标题和堆叠层级，减少遮挡与溢出。
[Codex][260712225747] 为 ddl-preview-a 的未来 Event 增加相对开始时间：1–59 分钟显示 in x minute(s)，1–12 小时显示 in x hour(s)，应用到右侧事件预览和周/日时间线，且不显示秒。
[Codex][260712000000] 新增 CLONE_DEPLOYMENT.md，详细说明在获得原作者授权并保留署名后，创建独立 GitHub 仓库、Cloudflare Pages、D1 数据库、域名、密钥及可选 MCP 实例的完整复刻部署流程。
[Codex][260712230710] 优化 ddl-preview-a 弹窗：桌面端保持固定尺寸，窄屏自动限制在视口内并支持纵向滚动；新增标题 HTML 转义，避免模板输入被当作 HTML 渲染。
[Codex][260712232420] 正式前端合并 DDL：统一 New 弹窗保留 Event 重复事件并新增 Deadline Tab；接入 deadlines 查询/创建/完成/重新打开 API；月/周/日/竖屏/Inspector 增加 DDL 展示、优先级、分类色、相对时间、到期线和浮层；保留固定弹窗布局与 Create 文案。
[Codex][260712232554] 完成正式前端细节收尾：月视图按像素裁剪并显示 +more，周/日时间线补充 Event/DDL 浮层和到期标签堆叠，DDL 新建默认使用分类跟随颜色，完成语法、Chrome 静态渲染和 Deadline 单元测试验证。
[Codex][260712233428] 修正正式 New 弹窗顶部结构：移除不属于静态预览设计的独立 New 标题，仅保留 Event/Deadline Tab，并改用无障碍 aria-label。
[Codex][260712234536] 修复 Event/Deadline Tab 内容混排：为隐藏表单增加 display:none !important，确保 Event Tab 只显示 Event 字段，Deadline Tab 只显示 Deadline 字段。
[Codex][260713001043] 按反馈调整正式前端细节：移除右侧 New deadline，顶部 New Event 改为 New，Event 创建按钮改为 Create，DDL 表单改为 Category 在前、Priority 在后，Inspector 预留稳定滚动条槽位，并将不足 24 小时的 DDL 相对时间改为小时。
[Codex][260713001833] 移除 Inspector、竖屏详情和月视图日期格中的 Add Event 入口，创建 Event/Deadline 统一只使用顶部 New 按钮。
[Codex][260712232601] 新增单次 Deadline 的 MCP 工具（查询、创建、读取、修改、删除、完成、重开），并同步更新 API_DOC.md 与 MCP_DEPLOY.md 的能力说明和使用约定。
[Codex][260713002108] 为 Deadline MCP 的 7 个工具增加 outputSchema，明确列表、DDL 对象和软删除结果的返回结构，帮助模型稳定理解工具输出。
[Codex][260713132828] 新增 production/NOTIFICATION_PHASE1_PLAN.md，基于当前 Event/DDL 后端生命周期、重复事件实例、前端刷新与倒计时逻辑，设计 Phase 1 通知执行方案及 Event 最多两个自定义提醒时间。
[Codex][260713132828] 修订 production/NOTIFICATION_PHASE1_PLAN.md：补充 Event/系列提醒配置持久化、统一 reminders 模型与 reminder_key、系列 PATCH/except/split、Event import、MCP 写操作、全天 DDL 日期算法、D1 batch 原子 dispatch、通知保留期限，并拆分服务端基础与通知展示阶段。
[Codex][260713134156] 再次修订通知计划：明确 POST/PUT/import 的 reminders 配置继承语义，增加定时 DDL 的 deadline:due，拒绝全天 Event 的非空自定义提醒，明确通过 events.series_id 子查询批量取消系列 occurrence 提醒，并补充对应测试。
[Codex][260713134428] 修订通知计划：统一 deadline:due 与 deadline:due_today key，明确重复 occurrence 不允许单独修改 reminders、必须通过 series PATCH，并补充 POST/PUT/import/series 配置继承测试和 DDL key 测试。
[Codex][260713134920] 修订通知计划范围与架构前提：明确当前仓库 MCP 无 DDL/import 工具并移出 Phase 1，区分 REST/MCP 独立接入工作，说明现有项目不存在统一写入业务层，避免低估提醒模块接入和 D1 batch 集成成本。
[Codex][260713135558] 修订通知计划：补充 MCP 无操作级 Idempotency-Key 的 UNIQUE 兜底边界、延迟派发按实际剩余时间生成文案、定时 DDL 已过提前提醒标记 skipped，以及首次打开时同一目标多条提醒的 Toast 合并策略和测试项。
[Codex][260713135905] 修复通知计划中的提醒唯一性冲突：将 reminders 的全状态唯一约束改为仅针对 pending 状态的 SQLite 部分唯一索引，保留 cancelled/sent/skipped 历史行并允许同 key 重算，补充 Event 改期、配置切换和 DDL priority 切换测试。
[Codex][260713141039] 实施 Notification Phase 1：新增 0009 通知迁移和共享 reminders 模块，接入 Event/DDL/重复系列/导入/MCP Event 的提醒生命周期，新增通知 API、前端自定义提醒选择器与轮询，补充提醒单元测试并同步项目、API、测试与变更文档。
[Codex][260713141204] 补齐通知前端交互：新增未读徽标、通知列表与已读操作，并在用户点击通知按钮时请求浏览器 Notification 权限，避免登录时自动弹出权限请求。
[Codex][260713143222] 修复提醒派发临界条件：全天 Event 的 09:00 提醒不再被开始时间误标 skipped；定时 DDL 的 deadline:due 不再因 overdue 状态误取消。新增两项派发状态回归测试。
[Codex][260713145047] 合并远端 Deadline MCP 工具更新与通知功能：保留 Deadline MCP outputSchema，并将 MCP Deadline 创建、改期、删除、完成和重开接入 reminders 计划生成、取消与重建逻辑。
[ClaudeCode][260713151639] Fix notifications popup (fixed height, unread dot/tint, Mark all read + POST /api/notifications/read-all endpoint) and stop non-series events showing "Delete Entire Series" (series-delete-actions[hidden] CSS override)
[ClaudeCode][260713153802] Add read-only event/deadline detail window (click event/deadline to view full info; Event: delete; Deadline: complete/reopen + delete); extend GET /api/events/:id with reminders field; repoint deadline click and event blocks to detail modal; update API_DOC
[ClaudeCode][260713155038] Restyle "Mark all read" as a real pill button (tinted border/background/color) instead of a bare text link, per user feedback
[ClaudeCode][260713160010] Fix detail window resizing while loading (fixed height, was max-height) and title/category-dot misalignment (CSS specificity bug left a 16px bottom margin on the title, throwing off flex vertical centering)
[Codex][260713160719] 更新 PROJECT_SPEC、API_DOC、CHANGELOG 和 TEST_CHECKLIST：同步记录 Web 前端、Deadline、通知、MCP 的当前完成度，保留真实未完成的联调验收与已知问题，并补充三组自动化测试通过记录。
[Codex][260713160732] 更新 BUGS.md 当前状态说明，补充 Web 前端、Deadline、通知已完成，并明确剩余本地联调与生产验收工作。
[ClaudeCode][260713161500] Fix portrait Timeline tab: event blocks had no click handler (bindInspectorActions was missing a [data-open-event] binding that bindCalendarDeadlineActions already had), so tapping an event there did nothing; now opens the detail window like everywhere else. Also collapse completed deadlines in the "Due soon" rail behind a native <details> "N completed" toggle, collapsed by default, so finished items don't clutter the active list.
[Codex][260713163710] 新增 production/ANDROID_NATIVE_DEVELOPMENT_PLAN.md：定义 Kotlin + Jetpack Compose 原生 Android 首版的范围、网页端设计映射、后端会话改造、UI、提醒同步、测试与实施顺序。
[Codex][260713164253] 配置 Android 开发环境：确认 Android Studio 与 SDK 已安装，设置用户级 JAVA_HOME、ANDROID_HOME、ANDROID_SDK_ROOT 及 SDK 工具路径；验证 OpenJDK 21、API 35、Build Tools、adb、sdkmanager、avdmanager、emulator 与许可证可用。模拟器镜像安装受 SDK 命令行工具 XML 版本不匹配影响，待通过 Android Studio SDK Manager 单独完成。
[ClaudeCode][260713164836] 清理 updates.md：删除全部 335 条 hook 自动生成的通用 "file updated" 占位行，仅保留有实质描述的记录（457 行精简至约 121 行）；同时在 CLAUDE.md 的 Update Logging 规则中新增要求：每轮/每个任务结束前需删除该轮 hook 追加的通用 "file updated" 行，替换为一条具体总结，避免未来再次堆积无意义占位行。
[Codex][260713170515] 新建 android/ Kotlin + Jetpack Compose 原生项目：配置 Gradle Wrapper、Android SDK 35、Kotlin、Compose、Retrofit 与 Cookie 登录；实现登录、月视图、手机/平板自适应当日 Inspector、Event/Deadline 读取和创建，首次 Debug APK 已成功构建。
[Codex][260713170832] 扩展 Android 原生核心流程：Event 与 Deadline 详情可点击打开，支持标题修改、软删除，以及 Deadline 完成/重开；再次完成 Kotlin 编译与 Debug APK 构建验证。
[Codex][260713171020] Android New Event 表单新增 Repeat：支持 daily/weekly/monthly/yearly、1–366 次 occurrence，并按后端规则生成 UUID 幂等键、周几或月日字段，接入 POST /api/event-series；Debug APK 构建通过。
[Codex][260713171344] Android 增加原生 Event 本地提醒通道、AlarmManager 调度、BroadcastReceiver 通知展示和 Android 13+ 用户主动授权入口；会话 Cookie 写入应用私有 SharedPreferences，重启后可恢复登录态；Debug APK 构建通过。
[Codex][260713171510] Android Calendar 的 Month/Week/Day 控件改为真实状态切换：新增一周七日横向概览与按日 Event/Deadline 时间列表，保留月视图和 Inspector；Debug APK 构建通过。
[Codex][260713171628] Android 新增每月日历私有离线缓存：成功同步后写入事件、Deadline 和分类，网络失败时加载最近成功数据；退出时清理缓存与会话，Debug APK 构建通过。
[Codex][260713171838] Android 重复 Event 详情新增 Skip this occurrence 与 Delete entire series，分别接入 series exception 和系列软删除 API，并取消对应本地提醒；Debug APK 构建通过。
[Codex][260713172217] Android 新增服务端通知中心（未读数、列表、单条/全部标为已读）并完成构建验证；本地提醒扩展为 Deadline 按优先级的定时/全天提醒，删除或完成 Deadline 时会取消其本地提醒。
[Codex][260713172642] Android 新建 Event 支持网页端同样的 0～2 个提醒时间（10 分钟至 1 天前），并传给普通/重复 Event API；对旧列表中未返回提醒配置的 Event 不再擅自安排默认本地提醒，避免已关闭提醒被误触发。
[Codex][260713172642] Android 日历新增分类筛选横条：月/周/日视图和当天详情同步筛选，All 可一键恢复全部分类，不影响后台数据与提醒调度。
[Codex][260713172839] 修复 Android 13+ 在用户拒绝通知权限后仍由提醒接收器投递通知的风险：投递前检查 POST_NOTIFICATIONS 授权，避免权限异常；随后重新执行 Android lint 验证。
[Codex][260713172839] Android 新建表单新增可编辑的 Event 开始/结束时间和 Deadline 截止时间，并在提交前校验 24 小时 HH:mm 格式及 Event 时间先后；表单内容可在窄屏纵向滚动，避免手机上被裁切。
[Codex][260713173027] 修复 Android 新建表单时间校验遗漏的 LocalTime 引用，并重新执行 Debug APK 构建与 lint 验证。
[Codex][260713173207] 为 Event 列表 API 增加实际生效的 reminders 字段，供 Android 精确恢复本地提醒；Android 在设备开机后从私有月缓存重建 Event/Deadline 提醒，并尊重 Event 已关闭的提醒配置。
[Codex][260713173529] Android Event/Deadline 详情页升级为完整编辑表单：可修改日期、时间、全天、分类、说明、提醒和 Deadline 优先级；提交前校验时间，改期后先取消旧本地提醒再按服务端结果重建。
[Codex][260713173600] 为 Android 完整编辑表单中的分类流式布局补充 Compose 实验 API 声明，修复编译阻断并重新执行构建检查。
[Codex][260713173654] Android Event、整个重复系列和 Deadline 的删除操作新增二次确认弹窗，避免触屏误触导致直接软删除。
[Codex][260713173737] Android 通知中心的单条通知现在可点击：标记已读后读取对应 Event/Deadline，切换到其所在月份和日期并刷新日历，不再只是已读状态操作。
[Codex][260713173905] Android 接入重复 Event 系列 PATCH：详情页可修改整个系列的标题和定时提醒，使用 UUID 幂等键调用服务端原子重建实例，并取消当前设备上的旧系列提醒后刷新。
[Codex][260713174140] 提取 Android 日期时间转换为 CalendarTime 纯 Kotlin 模块，并新增 JVM 单元测试覆盖上海时区定时 Event、全天 Event、非法/倒置时间和 Deadline 时间校验；创建与编辑流程统一复用该模块。
[Codex][260713174214] 修复 Android 界面复用 CalendarTime 时缺少的模块引用，恢复 Debug 单元测试和构建流程。
[Codex][260713174512] 完成 Android 验证收口：CalendarTime JVM 单元测试、Debug APK 构建和 lint 通过；启动本地 Pages + D1 后真实验证 Cookie 登录、Event reminders/CRUD、Deadline 状态流转与系列 PATCH，结果同步写入 TEST_CHECKLIST.md，真机与生产验收仍待进行。
[Codex][260713175112] Android 周视图与日视图中的 Event、Deadline 现在可直接点击打开详情/编辑，不再只能依赖当天 Inspector，提升手机触屏下的操作可达性。
[Codex][260713175218] 新增 Android 工程 README 与 .gitignore：说明本地运行、验证和正式签名原则，并排除 SDK 配置、构建产物及所有签名密钥，避免敏感文件误提交。
[Codex][260713175330] 升级开发依赖 Wrangler 至 4.110.0（Node 24 满足要求），修复本地 compatibility_date 回退告警；重新执行本地 D1 migration 成功，并将 BUG-0003 标记为 Fixed。
[Codex][260713175641] Android 新增安全的 release 签名配置：仅在本地 keystore.properties 存在时启用，提供已忽略的示例文件和发布说明；Release bundle 编译与正式私钥签名验收在 TEST_CHECKLIST.md 中分开记录。
[Codex][260713175750] 调整 Android Gradle release 签名配置的声明顺序，确保未来放入真实 keystore.properties 时先创建 signingConfig 再被 release buildType 引用。
[Codex][260713175850] 在 package.json 明确声明 type=module，消除 Node 对 Functions ESM 语法的重复重解析警告，后续回归测试将验证兼容性。
[Codex][260713180207] 真机模拟器启动验证发现 CalendarViewModel 无法被默认 AndroidViewModelFactory 创建（构造器含 Repository 参数）；改为单 Application 构造器并在类内创建 Repository，修复启动即崩溃。
[Codex][260713180446] Android Debug 构建新增 calendarApiBaseUrl Gradle 覆盖参数和仅 Debug 的明文本地网络许可，可通过 emulator 的 10.0.2.2 连接本地 Pages+D1 做真实登录联调；默认与 release 均保持生产 HTTPS 地址。
[Codex][260713180759] 模拟器本地登录联调发现 10.0.2.2 被错误视为生产域名而下发 Secure Cookie，导致后续 API 401；将 Android Emulator 宿主机桥接地址纳入 localhost Cookie 规则，修复仅本地 HTTP 联调的会话回传。
[Codex][260713181100] 在 API 35 Android 模拟器完成原生 Debug 包的真实联调验收：本地 Pages+D1 Cookie 登录、日历加载、Event/Deadline 创建、Deadline 完成/重开、应用强制结束后的会话恢复和 Android 13+ 系统通知授权均已验证；同步更新测试清单，保留定时实际触发、重启恢复、真机/平板和生产环境验收项。
[Codex][260713182004] 修复 Android 重启后本地提醒恢复的系统集成缺口：将 BootCompletedReceiver 导出给系统 BOOT_COMPLETED 广播，确保 AlarmManager 清空后可从私有缓存重新建立提醒。
[Codex][260713182513] 在 API 35 模拟器完成提醒端到端验收：真实 Event 本地闹钟已触发并显示系统通知；修改日期后旧 AlarmManager 闹钟被新时间替换；重启后 BOOT_COMPLETED 从私有缓存恢复待触发闹钟。同步更新测试清单。
[Codex][260713183209] 新建 API 35 Pixel Tablet（2560×1600）模拟器并完成宽屏验收：月/周/日切换、右侧详情栏以及 New Event/Deadline 弹窗均正常；同步更新测试清单，保留真实硬件的人工验收项。
[Codex][260713183357] 修复网页端与 Android 端跨设备修改后的本地提醒遗留：每次在线/缓存月数据刷新前先取消该月上一份缓存的 Event/Deadline 闹钟，再用当前服务端结果重建，覆盖远端软删除、关闭提醒、改期和完成 Deadline 的场景。
[Codex][260713183923] 完成跨设备软删除提醒验收：本地 Pages+D1 删除未来 Event 后，Android 模拟器重新加载服务端月份并取消对应 AlarmManager 待触发闹钟；确认此前匹配到的系统历史记录不被误判为活动闹钟。
[Codex][260713185225] 按真实手机反馈重构 Android 主界面空间与加载稳定性：短屏横向设备压缩顶栏/通知/卡片间距，月格改为日期与圆点锚定布局以避免被裁切；分类栏首帧预留固定骨架，缓存月数据先显示并后台预取相邻月份，避免加载后布局跳动并提升翻月流畅度。
[Codex][260713185754] 进一步对齐 Android 与网页端视觉：主日历/详情面板改为白底细分隔线，移除 Material 默认淡紫大块容器；“All”状态仅高亮 All，单个分类恢复中性外观并带分类颜色圆点，减少视觉噪声。
[Codex][260713190013] 完成 Android 主界面真实分辨率回归：2880×1260 短屏横向模拟器确认月格数字/圆点和当天预览完整可见，2560×1600 平板确认完整导航与宽屏分栏未回归；测试清单保留真实设备复验项。
[Codex][260713191100] 根据用户更正的真实设备尺寸（手机竖屏 1260×2880、平板 2800×1840）调整 Android 响应式规则：以宽高比判定竖屏，竖屏隐藏品牌并压缩顶栏和分类栏，但保留正常月格字号与圆点；月历获得更多高度，测试清单改为等待实际比例复验。
[Codex][260713191300] 使用 API 35 模拟器按手机 1260×2880 和平板 2800×1840 的真实比例完成已登录主界面复验：手机月历日期和圆点完整、当天预览可用；平板保留品牌、分类栏和左右分栏详情布局；测试清单已更新。
[Codex][260713192000] 根据真机反馈移除 Android 主界面顶部分类筛选栏，保留分类颜色与编辑选择；Deadline 列表和详情新增显著的完成态（勾选、淡化、删除线、Completed/Reopen 语义）；事件和 Deadline 编辑改用原生日期/时间选择器及颜色圆点分类选择，减少手输格式和密集文字标签。
[Codex][260713193000] Android 当天详情补齐网页端的 Preview / Timeline 紧凑切换，标签放在日期标题行右侧；Timeline 改为按 00:00–23:00 小时分段的可滚动视图，事件和 Deadline 定位到对应小时，避免原先 Day 视图只是重复列表。
[Codex][260713194000] 修正 Android Timeline 对全天项目的处理：全天 Event 与 Deadline 现在显示在独立的 ALL-DAY 行，不会被错误归入某个小时，和网页端时间轴规则一致。
[Codex][260713194500] 将 Android Week 视图从七张日卡片改为完整周时间网格：全天项目使用独立 ALL 行，00:00–23:00 按小时展示，每天固定一列；窄屏可横向滚动、宽屏完整展开，项目仍可直接点击编辑。
[Codex][260714115000] 根据真机反馈优化 Android 主界面：事件和 Deadline 颜色按专属色、分类色、兜底色依次解析；成功新建/编辑/删除/完成后立即更新当前内存界面并后台静默同步，避免等待整月二次请求；主日历与详情改为网页端的平面分栏和细分隔线，替换大圆角容器与 Material 筛选芯片，主题主色同步网页蓝色。
[Codex][260716185728] 启动 Android 与网页端同构复刻：顶部导航加入网页端品牌圆点、视图切换和 New event，移除悬浮按钮；宽屏月视图改为网页同款彩色事件/Deadline 条目，竖屏继续使用点阵以保证手机可读性，主视图切换在窄屏保留在日历区域。
[Codex][260716190430] Android 的通知、新建、编辑、系列编辑及删除确认弹窗统一替换为网页同款居中白色圆角 Modal，标题/内容/固定操作栏分层；新建事件和 Deadline 的时间输入改用系统时间选择器，降低手机端编辑难度。
[Codex][260716192410] 补充 AI0506 Calendar 的原生日历应用图标并在 Manifest 中启用，消除安装包缺少应用图标的静态检查提示。
[Codex][260716193620] 对照网页表单样式，将 Android 登录、新建、编辑和系列表单的 Material 浮动标签输入框替换为浅灰底、10dp 圆角、上方小写标签的原生 Compose 字段；保留原有数据与校验逻辑。
[Codex][260716194410] 参照网页的 Cancel/Create/Save/Delete 胶囊按钮，新增 Android 原生 Modal 操作按钮组件，并替换新建、编辑、重复系列、Deadline 与删除确认弹窗中的默认 Material 按钮。
[Codex][260716194920] 调整事件和 Deadline 编辑弹窗的操作层级：固定底栏仅保留 Cancel 与 Save，删除、完成、重复系列等次要操作置于可滚动内容区，避免手机端底栏被多行操作挤高。
[Codex][260716195810] 宽屏月视图从圆角日期卡片改为网页同款连续细线网格，选中日使用 #EAF3FF；所有月视图中的“今天”统一为网页同款 #0071E3 实心日期圆点，手机端保留点阵事件摘要。
[Codex][260716200640] 使用 2560x1600 平板模拟器真机渲染检查后，修复登录卡片和 Calendar Modal 的宽度修饰器顺序；现在宽屏严格限制为网页同款 440dp，而不再被 fillMaxWidth 拉满。
[Codex][260716201730] 根据 1260x2880 手机模拟器登录验收，将 Android 登录失败时展示的原始 HTTP 状态码改为网页同款友好文案：401 显示 Invalid password，其余失败提示检查网络后重试。
[Codex][260716202310] 将 Android Compose 全局色板切换为网页端规范：移除默认紫色，统一使用 #0071E3、#F5F5F7、#1D1D1F、#86868B、#D2D2D7 和 #FF3B30；通知与错误容器同步使用网页的浅蓝/浅红背景。
[Codex][260716203210] 重构 Android 主界面顶栏几何：顶栏现在整行铺满并拥有网页同款底部分隔线，宽屏为 60dp 高/28dp 内边距，手机为 44dp 高/8dp 内边距；日历内容改为顶栏下独立留边，避免顶栏被外层空白缩窄。
[Codex][260716204050] 月视图补齐网页同款的前后月份日期与浅灰 #C7C7CC 文本，不再显示空白格；点击相邻月份日期会切换月份并加载对应数据，保持日历交互完整。
[Codex][260716204240] 修复相邻月份日期实现中的局部 marks 集合作用域错误，明确无数据日期使用空 DayMark 列表，恢复 Android 月视图的 Kotlin 编译通过条件。
[Codex][260716204410] 删除月历函数改动中遗留的多余右大括号，修复 Kotlin 顶层声明语法错误。
[Codex][260716205230] 将 Android 详情栏 Event/Deadline 项改为网页同款浅灰圆角条目与左侧 3dp 彩色竖线，补齐标题、时间/截止、优先级、分类和 Complete/Reopen 信息层级；完成 Deadline 保留绿色与删除线状态。
[Codex][260716210020] 顶栏左右月导航改为网页同款细边圆形按钮，Today 改为白底胶囊按钮；宽屏月份标题宽度恢复为网页同款 230dp 并居中，手机保持紧凑尺寸。
[Codex][260716210150] 为 Android 13 通知授权按钮补充 API 33 版本保护，消除 POST_NOTIFICATIONS 在旧系统上的静态检查警告。
[Codex][260716211030] 新建弹窗的 Event/Deadline 切换由 Material 下划线 Tab 替换为网页同款浅灰圆角分段控件，选中项白底深色字，未选项使用辅助灰色。
[Codex][260716211420] 修复自定义 Android 登录输入框未掩码的问题：CalendarTextField 支持视觉转换，登录密码字段现在使用 PasswordVisualTransformation，与网页 password 输入保持一致。
[Codex][260716211710] 登录页提交按钮替换为与网页一致的全宽蓝色圆角胶囊按钮，移除最后一个默认 Material Button 外观。
[Codex][260716212120] 日期与时间选择器保留 Android 原生弹出选择能力，但外层由 Material OutlinedButton 改为网页同款浅灰圆角字段，统一标签、边框、间距与下拉提示。
[Codex][260716212620] 新增网页风格的圆角表单选项按钮，替换新建、编辑和系列编辑中的提醒、重复频率及 Deadline 优先级 Material FilterChip；保留选择上限和禁用逻辑。
[Codex][260716213040] All-day 与 Repeat 开关从 Material Switch 替换为网页色板的轻量圆角滑动开关，开启为 #0071E3、关闭为 #D2D2D7，保持 38dp 触控宽度。
[Codex][260716214800] 重建 Android Week/Day 原生时间轴：按网页端 7:00–23:00、56dp 小时刻度、日期表头、全天行、事件真实起止时间定位、重叠事件分栏、Deadline 横线与当前时间红线展示，替换原先按整点堆叠的列表格。
[Codex][260716214910] 调整 Android Day 时间轴为占满当前可用日历列宽；Week 仍使用固定日列并允许横向滚动，使两种视图与网页端对应的宽度行为一致。
[Codex][260716215100] 将 Android 宽屏右侧详情栏从比例分配改为网页同款固定 320dp 宽度，并对齐网页的 24dp 横向与 22dp 总顶部留白，避免平板上详情栏过宽、月历区域被不均匀挤压。
[Codex][260716215320] 补齐 Android 新建弹窗的日期选择字段并将所选日期传入 Event/Deadline 创建请求；同时为 All-day 的时间字段预留固定高度，切换全天状态时弹窗布局不再上下跳动。
[Codex][260716215450] 为 Android 新建、Event 编辑与 Deadline 编辑的时间/日期校验提示增加固定 18dp 占位；提示出现或消失时不再推动表单字段和底部操作栏。
[Codex][260716215540] Event 与 Deadline 编辑弹窗的时间字段改为固定 66dp 占位区，All-day 开关仅隐藏内部字段而不改变弹窗布局，进一步对齐网页端的稳定表单行为。
[Codex][260716215630] 通知弹窗的 Close 与 Mark all read 改为统一的网页风格胶囊操作按钮，移除残留的默认 Material 文字按钮。
[Codex][260716215900] 将 Android 的 Event/Deadline 编辑、删除、跳过重复实例、删除系列、完成与重新打开 Deadline 改为乐观更新：先立即更新当前界面，再静默向服务端确认；失败时自动回拉当月权威数据并提示错误，减少操作后的等待感。
[Codex][260716220020] 修正重复 Event 乐观删除后的本地提醒清理顺序：在移除界面项前先保留对应 Event ID，服务端成功后仍能正确取消该实例或整组实例的本地提醒。
[Codex][260716220200] 根据 Android 静态检查将新建弹窗的整型 Tab 状态改为 Compose 专用 mutableIntStateOf，消除一次不必要的装箱分配提示；其余 lint 项为既有依赖版本和 ReminderScheduler 提示，未在本轮 UI 工作中扩大升级范围。
[Codex][260716220500] 根据有数据的 1260×2880 模拟器渲染，移除会长期占据月视图高度的通知授权横幅；通知权限改为用户点击顶栏铃铛时按需请求，释放手机端月历与当日预览空间并对齐网页端的无常驻横幅布局。
[Codex][260714143000] 分析本地 Juno 和声音频并生成左右声道、Mid/Side 四个分离候选音频文件，检查立体声相关性以评估两个声部的可分离程度。
[Codex][260714143200] 新增 Juno 和声的低频低声部候选文件 low_voice_candidate_700Hz.wav；该文件通过 700Hz 低通筛选，作为低声部试听参考。
[Codex][260716220720] 根据 Week 实机渲染修复时间轴全天栏与 Deadline 标记：全天标签统一为单行 All-day；Deadline 标记改为 22dp 覆盖层，在横线中央稳定显示可读标题，不再只呈现孤立横线。
[Codex][260716220900] 移除 Android 新建弹窗中网页端不存在的 New item 标题栏；CalendarModal 支持无标题模式，新建表单现在直接以 Event/Deadline 分段控件开始，释放手机端可视编辑空间。
[Codex][260716221000] 顶栏创建按钮文案由 + New event 对齐为网页端的 + New，保持紧凑手机模式仍仅显示 +。
[Codex][260717184800] 修复高密度横屏平板适配：宽度不足 1080dp 时启用紧凑顶栏并把 Month/Week/Day 切换移入日历区，避免品牌、导航和操作按钮挤在同一行；CalendarModal 改为按当前可用高度动态计算内容上限，始终为固定底部操作栏预留空间，防止新建/编辑按钮被裁切。
[Codex][260717185100] 在 production/ 临时加入仅供 2800×1840 高密度平板模拟器验收的本地空日历接口脚本；该文件不进入版本历史，验收结束后删除。
[Codex][260717190000] 完成 2800×1840/480dpi 平板与 1260×2880/480dpi 手机模拟验收：主界面无重叠，新建 Event/Deadline 表单可滚动到底，重复、优先级、分类及固定 Cancel/Create 按钮均完整可见；删除临时本地接口并准备恢复生产构建。
[ClaudeCode][260717165013] Installed emilkowalski/skills apple-design skill into .claude/skills/apple-design/SKILL.md for use in this project (design reference, no code changes)
[Codex][260717165958] 采用用户选定的三个蓝色日期圆点 favicon，新增 public/favicon.png 并在 public/index.html 注册网站图标
[Codex][260717170626] 将 favicon 外层白色圆角背景移除为透明，保留日历线条和三个蓝色日期圆点不变
[ClaudeCode][260717171333] Added Apple-design preview frontend at public/apple-preview/ (served at /apple-preview), isolated from production. Reuses the proven app.js data/render layer; new styles.css builds a full Apple design system (translucent materials, dark mode, size-specific typography, reduced-motion/transparency support); appended AppleFX interaction layer to app.js (interruptible rAF spring engine, spring modal present/dismiss, portrait drag-to-dismiss bottom sheets with velocity handoff + momentum projection + rubber-banding, swipe-between-periods, haptics). Adapted colorToSoftBg to theme-aware color-mix so event tints work in dark mode.
[ClaudeCode][260717172042] 通过临时 git worktree(基于生产分支 main)干净部署 apple-preview 到生产:wrangler pages deploy --branch=main,仅上线 public/apple-preview 前端,未携带工作区中未提交的后端(auth.js/events)与文档改动;原生产前端保持不变。已验证 calendar.ai0506.com/apple-preview/ 返回 200。
[ClaudeCode][260717172756] apple-preview 预取优化:rangeCache 现同时缓存事件+Deadline({events,deadlines});切月命中缓存即时完整渲染,不再等网络。新增 computeRange/fetchRangeData;prefetchAdjacentRanges 改为预热前后各 2 个月(周/日视图预热相邻)并并行请求;缓存上限提到 16。已干净部署到生产 calendar.ai0506.com/apple-preview(worktree 方式,未带未提交后端改动)。
[ClaudeCode][260717173337] 修复 apple-preview 弹出界面严重卡顿:根因是 backdrop-filter 大面积模糊在弹簧动画每帧重算。移除全屏 scrim 模糊,弹窗/popover/toast/时间轴Deadline标签改为不透明实体背景(仅靠边框+阴影表现层次),仅保留顶栏一处材质并将 --blur 由 20px 降到 14px。纯 CSS 改动,已干净部署到生产。
[ClaudeCode][260717174756] apple-preview 两处优化并部署:①New 等弹窗弹出提速——present/dismiss 弹簧 response 缩短(竖屏底部弹窗 0.42→0.3、桌面 0.4→0.26,关闭同样加快)。②深色模式彩色文字看不清:新增 inkColor() 将分类色前景按主题混向 --chip-ink(深色提亮/浅色加深),应用于事件chip/时间轴事件/全天chip/agenda分类/时间轴Deadline标签;CSS 中 ddl-chip/ddl-item-action/pri-tag 文字改用 color-mix。实测深色对比度由~2.6-3.1 提升到 4.2-5.7(达 WCAG AA)。仅动 apple-preview 副本。
[Codex][260717190100] 清理平板验收临时服务与脚本；正式构建将恢复 https://calendar.ai0506.com/，保留模拟器截图作为本轮手机和平板适配证据。
[Codex][260717190300] 生成平板适配后的正式 debug APK（10846586 bytes），确认 API_BASE_URL=https://calendar.ai0506.com/；CalendarTimeTest 3/3 通过，失败与错误均为 0。
[Codex][260717191000] 为最新 Apple 风格正式网页建立可复现视觉基准脚本：本地拦截认证、分类、事件、Deadline 与通知 API，以真实手机/平板物理分辨率输出浅色、深色及新建弹窗截图，不读取或改写生产日历数据。
[Codex][260717191300] 修正网页视觉基准脚本的登录完成判定：正式前端通过移除 aria-hidden 表示主界面可见，脚本改为等待属性不存在后再截图。
[Codex][260717191600] 网页 New 弹窗基准截图增加 700ms 稳定等待，排除弹簧入场动画中间帧，确保后续 Android 对照使用最终静止布局。
[Codex][260717193000] Android 开始迁移最新 Apple 网页骨架：新增系统浅/深双色板；手机隐藏网页不存在的 Month/Week/Day 行并重排月历/圆角 Preview 比例；平板恢复完整品牌、居中导航、视图切换、圆角月历、Deadline rail 和右栏分类筛选；表单与常用卡片改用主题色以支持深色模式。新增仅供同数据视觉对照的临时本地 API。
[Codex][260717193600] 临时 Android 视觉 API 增加请求路径日志，用于确认模拟器确实完成认证、分类、事件、Deadline 与通知全链路加载，排查截图中假数据尚未出现的问题。
[Codex][260717194200] 根据同数据实机截图继续校准 Apple 布局：手机月历高度再缩约 10%并把空间交给 Preview；平板顶栏由重叠的绝对三段改为顺序三段弹性布局，确保 933dp 宽度仍显示 Today；品牌圆点改为网页同款蓝点加浅蓝光环，事件卡显式使用高对比正文色。
[Codex][260717195100] 根据干净软件渲染平板截图校准月格：短横屏按网页只展示一个优先 Deadline chip 加“+N more”，宽屏月格优先排列 Deadline、手机点阵仍保持 Event 优先；选中日期补回 1.5dp 蓝色内边界，避免仅有浅蓝底导致选中态不清晰。
[Codex][260717200000] 对齐最新网页 New 表单：手机 CalendarModal 改为带抓手的底部 sheet，平板保留 440dp 居中弹窗；分类移到标题后，All-day 改为网页式方形复选框，提醒改为两个下拉选择，Repeat 改为“Does not repeat/Every…”下拉行，Deadline 按 Category→Priority→Date/Time→All-day 排序；所有新表单表面改用主题色支持深色模式，Kotlin 编译通过。
[Codex][260717200600] 扩展网页视觉基准覆盖：在手机/平板、浅色/深色基础上新增 New Deadline、Event detail，平板另新增 Week 与 Day 截图，用于继续核对二级流程而非只验收主月视图。
[Codex][260717200900] 修正扩展视觉脚本关闭 New Deadline 时误选隐藏 Event Cancel 的问题，改为明确点击当前可见 ddlForm 按钮，避免等待隐藏元素导致后续 Week/Day/Detail 截图中断。
[ClaudeCode][260717184947] 用 Apple 版前端正式替换主前端:public/{index.html,app.js,styles.css} 由 apple-preview 版本覆盖;保留 favicon 注册(/favicon.png)、标题改回 AI0506 Calendar、移除 Preview 标识、资源路径改回绝对路径(/styles.css、/app.js)。public/apple-preview/ 暂时保留作对照与回退。已用 detached worktree(HEAD 干净快照)部署到生产分支 main,未携带工作区未提交的后端(auth.js/events)改动;functions/ 未改动。已验证 calendar.ai0506.com 首页标题/favicon/深色meta/AppleFX/inkColor/预加载/实体弹窗均在线。
[Codex][260717185018] 新增 production/TAGS_TECHNICAL_PLAN.md：记录 Event、Deadline 与重复 Event 系列的全局多标签数据模型、API、网页与 Android 适配、筛选规则、兼容策略和验收计划；仅为讨论草案，未改动业务代码或数据库。
[Codex][260717190151] 根据计划评审修正 TAGS_TECHNICAL_PLAN.md：补充软删除 Tag 关联清理、普通与重复 Event 的多标签筛选、split 标签复制、NOCASE 唯一约束、分类名到 category_id 映射、批量读取避免 N+1，以及 import 幂等更新的标签语义。
[Codex][260717190557] 根据第二轮计划评审修正 TAGS_TECHNICAL_PLAN.md：明确 MCP/Agent 服务端多 Tag AND 查询与网页本地多选 OR 筛选的边界，定义 CSV 标签列编码、未来恢复软删除事项的约束，以及单分类推荐标签替换 API 与分类删除时的清理责任。
[Codex][260717191058] 根据第三轮计划评审修正 TAGS_TECHNICAL_PLAN.md：用范围子查询/JOIN 替代动态 IN 以规避 D1 绑定参数上限，补齐 Tag 名称管道字符校验和重名错误码，并明确 CSV 标签列追加在既有列末尾的兼容契约。
[Codex][260717202300] 验证最新版 Android Apple 风格界面可成功编译并通过单元测试；修正网页视觉基准的 Event/Deadline 详情接口优先级，并补充标签、描述模拟数据，使详情页和标签选择器能够按真实结构验收。
[Codex][260717203100] Android 顶部导航改为按当前视图工作：月视图按月、周视图按 7 天、日视图按 1 天翻页，并显示与网页一致的月份、周日期范围或完整日期标题；同时修正网页视觉基准的分类标签推荐接口路径。
[Codex][260717203500] Implemented global tags for Events, Deadlines, and recurring Event Series: added D1 schema and seeded suggestions; REST/MCP CRUD and AND server filters; import/export support; Web and Android tag selection, editing, and display; plus unit, browser-smoke, syntax, and Android compile verification.
[Codex][260717203700] Made the tag Web smoke test use TEST_BASE_URL instead of a fixed localhost port so isolated dev-server runs remain reproducible.
[Codex][260717214000] Unified Web tag-picker chip dimensions, removed Tag search fields, optimized portrait New-sheet initialization and animation, and added smoke assertions for these UI details.
[Codex][260717214500] Deployed the Web tag-picker and portrait New-sheet performance refinements to Pages production main; verified the production script no longer contains Tag search and includes the cached sheet-height path.
[Codex][260717215000] Fixed the New modal regression by using the global isPortrait helper instead of the AppleFX-private portrait helper in the tab focus path.
[Codex][260717215200] Deployed the New modal regression fix to Pages production main and verified the production app script includes the global isPortrait focus guard.
[Codex][260717220000] Limited Web Event and Deadline tag pickers to six chips by default, with Show more/Show less controls; added browser smoke coverage for the collapsed and expanded states.
[Codex][260717220100] Updated the existing Tag smoke assertion to expect the new six-chip collapsed default before verifying the expanded list.
[Codex][260717220300] Deployed the two-line Tag picker with Show more/Show less to Pages production main and confirmed the production app script contains the control.
[Codex][260717221000] Added versioned Web CSS and JavaScript URLs to prevent a cached pre-Tag script from being combined with the updated HTML and leaving the calendar on its loading screen.
[Codex][260717221300] Moved Tag and category-suggestion loading off the authenticated calendar critical path so Events and Deadlines can begin loading without waiting for Tag metadata.
[Codex][260717221400] Bumped versioned Web asset URLs for the authenticated-load optimization so browsers do not reuse the prior cached script.
[Codex][260717221600] Deployed the non-blocking Tag metadata load to Pages production main and verified the production homepage serves the new versioned script with its loading screen dismissed.
[Codex][260717204500] Applied `0010_tags.sql` to remote D1 calendar-db and deployed the Pages project to the production `main` branch; remote migration list confirms no pending migrations.
[Codex][260717204100] Android Event 与 Deadline 点击后的默认界面改为对齐网页的只读详情卡：分类、日期/时间、标签、提醒、重复状态、优先级、状态和备注按分隔行展示，底部提供网页同序的 Delete、Close 及 Deadline Complete/Reopen 操作；原编辑表单暂保留在内部以避免破坏已有更新能力。
[Codex][260717204600] 扩展本地 Android 视觉验收 API，补齐 Tags、分类标签推荐、事件备注及 Event/Deadline 标签关联数据，确保新建表单和只读详情页可在模拟器中按完整真实结构测试。
[Codex][260717205200] 根据安卓与网页同尺寸截图继续校准详情弹窗：平板详情宽度独立收窄为 400dp（新建表单仍为 440dp），详情操作栏改为 Delete 靠左、Close/Complete 靠右，与网页两种弹窗规格一致。
[Codex][260717205700] 修复平板切到 Week/Day 后再旋转或进入手机窄屏会被困在无切换按钮视图的问题：窄屏按网页规则自动回到 Month，避免周时间轴挤占手机预览区并确保手机端始终可操作。
[Codex][260717210500] 实机尺寸复现并修复手机新建表单底部按钮被系统导航条遮挡：CalendarModal 现在把 Android navigation bar 安全区计入可用高度，表单正文继续独立滚动，Cancel/Create 操作栏始终完整固定在导航条上方。
[Codex][260717211200] 模拟器确认 Compose Dialog 在手势导航模式下错误报告零底部 inset，改为手机底部 sheet 显式保留 24dp 手势安全区，避免仅调用 navigationBarsPadding 仍让操作栏落到系统白色手势条之后。
[Codex][260717212000] 补齐网页平板 Inspector 的 Tags 筛选：Android 状态新增多标签筛选集合，右侧分类列表下展示标签按钮；分类与标签组合时按 AND 约束、多个标签按网页的“命中任一标签”语义过滤 Event/Deadline。
[Codex][260717212200] 为 DayInspector 的可换行标签筛选布局补充 Compose ExperimentalLayoutApi 显式声明，修复新增 Tags 筛选后的 Kotlin 编译拦截。
[Codex][260717212900] 在保持网页只读详情默认观感的同时恢复 Android 修改能力：Event/Deadline 标题区新增轻量 Edit 入口，进入已包含 Tags 的原生编辑表单；编辑页返回或 Cancel 回到详情而非直接关闭整条流程。
[Codex][260717213100] Deadline 编辑页的系统返回与 Cancel 同步改为返回只读详情，补齐 Event/Deadline 两条编辑流程的一致导航行为。
[Codex][260717213600] 更新 Android README，记录原生 Apple 网页视觉映射、手机/平板响应式结构、只读详情加 Edit 策略、标签筛选，以及 1260×2880 与 2800×1840 双尺寸和手势安全区回归要求。
[Codex][260717215400] 完成 Android 第一版生产构建验收：testDebugUnitTest 3/3 通过、lintDebug 通过、assembleDebug 成功；最终 APK 为 10,906,591 bytes，SHA-256 5AFADE9A54F46305A1917E6A5CAD492173CCF6E4EE6B16CB7DF9DD2C5D1E6B30，并确认内置 API_BASE_URL 已恢复 https://calendar.ai0506.com/，本地视觉模拟服务已停止。
[Codex][260717222500] 根据已部署网页 Tag 选择器再次更新 Android：移除计数式标签标题，改为“Tags · optional, up to 5”；Tag chip 固定为网页同规格 94×32dp，默认仅展示 6 个并提供 Show more (N)/Show less，保留分类推荐边框、最多选择 5 个及禁用状态。
[Codex][260717223300] 对齐网页 22:13 的非阻塞 Tag 加载策略：Android 月份首屏改为并行请求 Event、Deadline、Category，不再等待或依赖 Tags/分类推荐；Tag 元数据在独立后台任务中并行加载，失败不遮挡日历，成功后原位更新表单与筛选并写回当前月份缓存。
[Codex][260717223900] 视觉验收数据改用迁移 0010 的真实 Tag 名称、排序和 10 项规模，Event/Deadline 关联同步更新；网页基准新增 Tag 展开态截图，Android 本地 API 同步覆盖默认 6 项与 Show more 的真实场景。
[Codex][260717204906] 重新审计当前网页版 Tag 与启动链路并完成 Android 对齐：修正视觉模拟推荐数据格式；防止切月空缓存覆盖已加载 Tag；新增 Tag 排序/前六项单测；选择器在手机和平板均固定三列、默认 6 项且可展开；慢 Tag 接口不阻塞主日历；更新 Android README 与测试清单并完成 1260×2880、2800×1840@480dpi Event/Deadline 表单双尺寸验收。
[Codex][260717205133] 完成当前 Web/Android Tag 版本最终验收：网页 app.js 语法和 Tag 单测通过；Android 5/5 单元测试、lintDebug、assembleDebug 全部通过；生产 Debug APK 为 10,910,067 bytes，SHA-256 3E41847753698073A7746EC1F0D6996B77620C7E898ED3731BE4DA1F2D3E35AF，确认内置 API_BASE_URL 为 https://calendar.ai0506.com/，最终包已装回模拟器且本地模拟服务已停止。
[Codex][260717210535] 再次对照网页顶栏展示逻辑优化 Android：手机顶栏控件间距由 8dp 增至 10dp并略收窄 Today 内边距，平板在 Today 导航组与 Month/Week/Day 操作组之间增加 12dp 明确分区；使用 public/favicon.png 生成各 Android 密度回退图标和 API 26+ 自适应图标，替换原单色占位启动图标。
[Codex][260717210903] 完成顶栏与 favicon 实机尺寸视觉复验：1260×2880 手机顶栏保持单行且 Today/通知/New 间距清楚，2800×1840@480dpi 平板导航组与视图操作组分隔明确；新自适应图标在模拟器圆形启动器遮罩下无裁切；同步更新 Android README/测试清单并移除未使用的旧占位矢量图标。
[Codex][260717211056] 完成顶栏与应用图标版本生产构建：Android 5/5 单元测试、lintDebug、assembleDebug 全部通过；最终 APK 为 11,043,458 bytes，SHA-256 D529A38C26DF4B517860DA6ED4ABE892AB42D1F9E967593B683B0B5E84855DDA，确认包含六档回退 launcher 图标与 API 26 自适应图标且内置生产 API 地址；最终包已装回模拟器，本地视觉服务已停止。
[Codex][260719182221] 升级 Web 通知中心与提醒派发语义：历史未读不再在登录/刷新后重复弹出，浏览器提示改为显式开启，通知点击会标已读并定位 Event/Deadline，列表展示计划提醒时间；过期全天 Event、到期后的 Deadline 提前提醒及超过 24 小时的最终 due 提醒不再陈旧补发，并补充单元测试、桌面/390px 竖屏浏览器回归和项目文档。
[Codex][260719182847] 将 Web 通知升级正式部署到 Cloudflare Pages main：Wrangler 成功上传静态资源与 Functions bundle，部署预览为 dcf231bb.calendar-3ad.pages.dev；正式域名 calendar.ai0506.com 已加载资源版本 20260719-180947，认证通知接口验证成功并返回 scheduled_at 字段。
[ClaudeCode][260721101500] 为 MCP 全部 20 个工具加 calendar_ 前缀（functions/mcp/index.js），避免 Claude 把日历工具与同时挂载的 Cloudflare MCP 工具混淆；tools/list 只暴露新名，callTool 通过 resolveToolName 把旧的无前缀名透明映射到新名以兼容已连接客户端，tools/call 的 outputSchema 查找同步走解析后的名字；同步更新 API_DOC.md、MCP_DEPLOY.md、CHANGELOG.md。四套单测全过，已部署到分支预览 agent-favicon-calendar.calendar-3ad.pages.dev（生产 calendar.ai0506.com 未更新）。
[ClaudeCode][260721104500] 将 Tag 系统、Android 客户端与 calendar_ 前缀 MCP 工具合入 main 并部署生产：删除已实施完毕的 public/apple-preview/ 原型（线上 /apple-preview/ 已回落到主页）；四套单测通过；生产验证 calendar.ai0506.com 主页 200、/api/tags 未授权 401、/mcp 未授权返回 -32001，并通过已连接客户端以旧名 list_tags 调通生产、确认 resolveToolName 兼容层生效、17 个种子标签就位。遗留：GET /api/events 对每个事件单查一次 effectiveEventReminders 存在 N+1（当前 57 个活动事件无影响，量大后需改批量查询）。

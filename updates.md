[ClaudeCode][260710091625] file updated
[Codex][260712002611] Fixed MCP and REST recurring-series partial-update merging by sharing a stored-row merge helper; omitted fields now retain category, color, metadata, and recurrence values, null remains an explicit clear, malformed weekdays JSON is safe, and MCP series updates now validate temporal ordering. Added regression tests and checklist coverage.
[ClaudeCode][260710091858] file updated
[ClaudeCode][260710091906] file updated
[ClaudeCode][260710091917] file updated
[ClaudeCode][260710091924] file updated
[ClaudeCode][260710092126] file updated
[ClaudeCode][260710134412] file updated
[ClaudeCode][260710134440] file updated
[ClaudeCode][260710134447] file updated
[ClaudeCode][260710134454] file updated
[ClaudeCode][260710134510] file updated
[ClaudeCode][260710134517] 初始化 Phase 1 项目文档：创建 PROJECT_SPEC.md、API_DOC.md、BUGS.md、CHANGELOG.md、TEST_CHECKLIST.md、updates.md（未写后端代码）
[ClaudeCode][260710134531] file updated
[ClaudeCode][260710134733] file updated
[ClaudeCode][260710134736] 创建项目级 CLAUDE.md，写入 Update Logging 规则、项目文档清单与开发规则
[ClaudeCode][260710134739] file updated
[ClaudeCode][260710135041] Stage 1 完成确认：Phase 1 项目文档齐备（PROJECT_SPEC/API_DOC/BUGS/CHANGELOG/TEST_CHECKLIST/updates），等待用户确认后进入 Stage 2（脚手架 + 迁移）
[ClaudeCode][260710135050] file updated
[ClaudeCode][260710135403] file updated
[ClaudeCode][260710135408] file updated
[ClaudeCode][260710135412] file updated
[ClaudeCode][260710135418] file updated
[ClaudeCode][260710135426] file updated
[ClaudeCode][260710135429] Stage 2 完成：创建项目脚手架 wrangler.toml、package.json、.gitignore、.dev.vars.example、public/index.html（未含 migration，未实现 API）
[ClaudeCode][260710135437] file updated
[ClaudeCode][260710135618] file updated
[ClaudeCode][260710135621] Stage 3 完成：创建 migrations/0001_init.sql（events 表、categories 表、索引、8 个默认分类种子；未实现 API/auth）
[ClaudeCode][260710135636] file updated
[ClaudeCode][260710135942] file updated
[ClaudeCode][260710140005] file updated
[ClaudeCode][260710140012] file updated
[ClaudeCode][260710140018] file updated
[ClaudeCode][260710140022] file updated
[ClaudeCode][260710140026] file updated
[ClaudeCode][260710140038] file updated
[ClaudeCode][260710140042] Stage 4 完成：实现认证。新增 _lib/response.js、_lib/auth.js、_middleware.js、api/auth/{login,logout,status}.js；采用长期有效(约1年)httpOnly+Secure+SameSite=Lax 签名 Cookie，可通过更换 SESSION_SECRET 使全部会话失效；同步更新 PROJECT_SPEC §5（未实现 events API）
[ClaudeCode][260710140050] file updated
[ClaudeCode][260710140248] file updated
[ClaudeCode][260710140333] file updated
[ClaudeCode][260710140346] file updated
[ClaudeCode][260710140358] file updated
[ClaudeCode][260710140414] file updated
[ClaudeCode][260710140421] file updated
[ClaudeCode][260710140426] file updated
[ClaudeCode][260710140437] file updated
[ClaudeCode][260710140442] Implemented Stage 5 events CRUD API. 新增 _lib/db.js、_lib/events.js、api/events/index.js、api/events/[id].js；GET/POST /api/events 与 GET/PUT/DELETE /api/events/:id（软删除、参数化 SQL、保留时区偏移）；更新 API_DOC.md 与 CHANGELOG.md；node --check 语法校验通过
[ClaudeCode][260710140451] file updated
[ClaudeCode][260710141241] Local CRUD test of Stage 5 events API completed via wrangler --local (npm install, db:local migration, pages dev). All 8 scenarios passed: auth middleware, bearer token access, POST/GET/PUT/DELETE, soft-delete persistence, timezone-offset preservation. No code bugs found; code unchanged.
[ClaudeCode][260710141247] file updated
[ClaudeCode][260710141810] Connected local project to GitHub repo https://github.com/ai0506/calendar. git init, verified .dev.vars/.env/node_modules/.wrangler are gitignored, staged tracked project files, created initial commit 6b07cfc "Initial AI0506 Calendar backend foundation", added remote origin, renamed branch to main, pushed to origin/main.
[ClaudeCode][260710141821] file updated
[ClaudeCode][260710142335] file updated
[ClaudeCode][260710142347] file updated
[ClaudeCode][260710142357] file updated
[ClaudeCode][260710142535] file updated
[ClaudeCode][260710142545] file updated
[ClaudeCode][260710142552] file updated
[ClaudeCode][260710142601] file updated
[ClaudeCode][260710142614] file updated
[ClaudeCode][260710142616] Implemented Stage 6 import export categories API.
[ClaudeCode][260710142623] file updated
[ClaudeCode][260710142851] file updated
[ClaudeCode][260710142854] Committed and pushed Stage 6 (7243959) to origin/main. Created DEPLOY_CHECKLIST.md (Cloudflare production deployment checklist only, no resources created, no deployment executed).
[ClaudeCode][260710142858] file updated
[ClaudeCode][260710144858] file updated
[ClaudeCode][260710144940] Cloudflare production D1 setup: authenticated via wrangler login (benjaminai0506@outlook.com), created production D1 database calendar-db (id e5d18701-8319-4a8a-a544-b83acbb2bda0), updated wrangler.toml database_id, applied migrations/0001_init.sql to --remote (8 commands, verified events/categories tables + 8 seed categories present, events table empty). No deployment executed, no application code changed.
[ClaudeCode][260710144950] file updated
[Codex][260710153137] Phase 1 closeout: fixed localhost session cookie handling while preserving Secure cookies for production domains; updated BUGS.md and TEST_CHECKLIST.md with current backend test status and documented import re-run after soft-delete external_id issue without changing schema.
[ClaudeCode][260710154345] file updated
[ClaudeCode][260710154432] file updated
[ClaudeCode][260710154522] file updated
[ClaudeCode][260710154707] Phase 2 UI exploration: created ui-preview/ with 3 static HTML design directions (design-a Apple Calendar style, design-b Notion knowledge-system style, design-c Google Calendar Pro time-grid style) using mock data; no backend/API/schema touched.
[ClaudeCode][260710160102] file updated
[ClaudeCode][260710160113] file updated
[ClaudeCode][260710160429] file updated
[ClaudeCode][260710160614] file updated
[ClaudeCode][260710160646] Phase 2 UI exploration: developed 3 fully-interactive divergent variants of the chosen Apple-style direction (design-a-a Pure Minimal fullscreen no-sidebar, design-a-b Frosted Sidebar with macOS vibrancy, design-a-c Split Inspector with live day-agenda panel). All support real Month/Week/Day switching with functional time-axis timelines, working prev/next/Today navigation, category filter toggling, and a centered Apple-style New Event modal that appends events into the in-memory mock dataset (no persistence/backend). Verified via local static preview server, no console errors.
[ClaudeCode][260710162743] file updated
[ClaudeCode][260710162748] file updated
[ClaudeCode][260710162753] file updated
[ClaudeCode][260710162800] file updated
[ClaudeCode][260710162805] file updated
[ClaudeCode][260710162818] file updated
[ClaudeCode][260710162824] file updated
[ClaudeCode][260710162831] file updated
[ClaudeCode][260710162843] file updated
[ClaudeCode][260710162853] file updated
[ClaudeCode][260710162902] file updated
[ClaudeCode][260710163421] Fixed 4 UX issues in design-a-c.html (chosen Split Inspector direction): (1) day selection no longer rebuilds the entire month grid, only toggles the is-selected class, fixing perceived jank; (2) All-day checkbox now dims/disables the time fields instead of hiding them, so the modal no longer resizes/jumps; (3) added an interval-partitioning layout algorithm so overlapping same-day events render side-by-side in Week/Day timelines instead of stacking invisibly, with new overlap demo data on Jul 10 and Jul 16; (4) added start/end time validation that blocks event creation and shows an inline error when end time is not after start time.
[ClaudeCode][260710164021] file updated
[ClaudeCode][260710164026] file updated
[ClaudeCode][260710164042] file updated
[ClaudeCode][260710164049] file updated
[ClaudeCode][260710164055] file updated
[ClaudeCode][260710164102] file updated
[ClaudeCode][260710164111] file updated
[ClaudeCode][260710164117] file updated
[ClaudeCode][260710164122] file updated
[ClaudeCode][260710164135] file updated
[ClaudeCode][260710164221] Further UX fixes on design-a-c.html: (1) the time-validation error text was still causing modal height jump because the row was display:none by default - reserved a fixed-height slot and toggle via opacity instead; (2) removed backdrop-filter blur on the New Event modal scrim, which was forcing a full re-blur of the 42-cell month grid behind it on every repaint and caused the perceived delay when clicking category color swatches; (3) added a delete (x) button on every event, both in the day-inspector agenda list and on Week/Day timeline blocks, wired to a shared confirm dialog (Cancel/Delete) before removing the event from the in-memory mock dataset.
[ClaudeCode][260710230703] file updated
[ClaudeCode][260710230708] file updated
[ClaudeCode][260710230718] file updated
[ClaudeCode][260710230723] file updated
[ClaudeCode][260710230729] file updated
[ClaudeCode][260710230739] file updated
[ClaudeCode][260710230843] Fixed all-day events showing no text in Week/Day view of design-a-c.html: all-day events (start 00:00, end 23:59) were positioned at top:-420px in the hourly grid (since GRID_START_HOUR is 7 AM), scrolling their title text off-screen while only a sliver of the color bled into view. Added a dedicated all-day banner row above the hourly grid (buildAllDayRowHTML) that renders all-day events as chips with visible title and delete button, and excluded them from the timed-hour layout algorithm.
[ClaudeCode][260710231921] file updated
[ClaudeCode][260710231932] file updated
[ClaudeCode][260710231937] file updated
[ClaudeCode][260710231947] file updated
[ClaudeCode][260710232013] file updated
[ClaudeCode][260710232023] file updated
[ClaudeCode][260710232030] file updated
[ClaudeCode][260710232041] file updated
[ClaudeCode][260710232206] Added aspect-ratio-driven portrait mode to design-a-c.html: when viewport width/height ratio < 1.35 (anything not clearly landscape, regardless of device) the layout switches to a stacked portrait view - compact month grid on top (all days with brief event marks) and the selected/current day detail below. Switch is live on window resize. Provided 3 portrait style variants via a segmented control: Dots (iOS-style colored dots + agenda), Timeline (dots + real hour timeline reusing the day grid), Bars (colored density bars + agenda). Refactored agenda item into shared agendaItemHTML helper (also now shows All-day label).
[ClaudeCode][260710232846] file updated
[ClaudeCode][260710232851] file updated
[ClaudeCode][260710232858] file updated
[ClaudeCode][260710232910] file updated
[ClaudeCode][260710232917] file updated
[ClaudeCode][260710232926] file updated
[ClaudeCode][260710232931] file updated
[ClaudeCode][260710232939] file updated
[ClaudeCode][260710232946] file updated
[ClaudeCode][260710232952] file updated
[ClaudeCode][260710233003] file updated
[ClaudeCode][260710233159] design-a-c.html: (1) added an in-progress/"now" marker for events currently within their time range (mock now = 13:45 on TODAY via NOW_MIN + isOngoing helper) - shown in both orientations: red pulsing ring + inline NOW badge on Week/Day/portrait-timeline blocks, a red "Now" badge in agenda lists (landscape inspector + portrait dots), and a red outline on landscape month chips; month chips now sorted by start time; added a demo ongoing event (Revision focus block 13:30-15:00) and prefers-reduced-motion fallback. (2) Fixed portrait month-switch jitter: nav-title had min-width:0 so the next-month arrow and Today button shifted as month-name length changed - gave the portrait title a fixed 150px centered slot (fits September 2026 without clipping) so the arrows/Today stay put. Dots remains the default portrait style.
[ClaudeCode][260710233900] file updated
[ClaudeCode][260710233909] file updated
[ClaudeCode][260710233916] file updated
[ClaudeCode][260710233922] file updated
[ClaudeCode][260710233933] file updated
[ClaudeCode][260710233940] file updated
[ClaudeCode][260710233947] file updated
[ClaudeCode][260710233952] file updated
[ClaudeCode][260710234004] file updated
[ClaudeCode][260710234011] file updated
[ClaudeCode][260710234023] file updated
[ClaudeCode][260710234038] file updated
[ClaudeCode][260710234150] design-a-c.html portrait restructure: (1) made all buttons/clickable controls non-selectable (user-select:none on button, nav-arrow, today-pill, inspector-add, cat-item, day cells, event chips). (2) Removed the Bars month layout entirely (pm-bars/pm-bar CSS + JS branch) so the portrait top half is always Dots. (3) Removed the top Dots/Timeline/Bars switcher bar; moved the mode switch into the bottom section as a Preview/Timeline tab (portraitTab state, setPortraitTab) - Preview = the agenda list (former dots/bars bottom half), Timeline = the hour timeline. Default tab is Preview.
[ClaudeCode][260710234752] file updated
[ClaudeCode][260710234800] file updated
[ClaudeCode][260710234806] file updated
[ClaudeCode][260710234821] file updated
[ClaudeCode][260710234837] file updated
[ClaudeCode][260710234941] design-a-c.html portrait detail polish: fixed layout jump when switching Preview/Timeline. Root cause: in Preview the inspector itself scrolled (outer scrollbar) but in Timeline the inner time-scroll scrolled, so the outer scrollbar appeared/disappeared and shifted the header/count. Now the inspector never scrolls (overflow:hidden); the header (date + count) and the Preview/Timeline tabs are pinned, and scrolling always happens in an inner region (pd-scroll for Preview with scrollbar-gutter:stable, time-scroll for Timeline). Also made the tabs compact and moved them into the header row (right side) instead of a full-width row, and merged the event count into the eyebrow (Today . N events). Verified header geometry is byte-identical across tab switches.
[ClaudeCode][260710235712] file updated
[ClaudeCode][260711000148] design-a-c.html: portrait detail eyebrow now uses 3-letter weekday abbreviations (MON/TUE/WED) inside a fixed-width slot (.pd-dow, min-width 2.8em), so the ". N events" text starts at the same x for every day (verified weekday-slot right edge = 48.8px across Wed/Sun/Thu/Fri/Mon) - no more horizontal drift when browsing days; dropped the special "Today" word in the eyebrow for width consistency (today still marked by the blue circle in the grid). Cleanup: deleted redundant preview files (design-a.html, design-b.html, design-c.html, design-a-a.html, design-a-b.html), keeping only the chosen design-a-c.html. Docs: added FRONTEND_SPEC.md summarizing the frontend UI requirements (visual direction + the overarching no-jitter/stability principle + layout/responsive/event/form rules) and referenced it from CLAUDE.md project docs list.
[Codex][260711002005] Implemented production frontend from design-a-c template: replaced public/index.html with app shell/login/event modals, added public/styles.css for Apple-style calendar UI, added public/app.js for cookie auth, categories/events API loading, create/delete events, 10-second visible-range refresh, real current-time markers, and state-preserving responsive rendering.
[Codex][260711003200] Fixed portrait frontend visual regression by clearing default button styling on portrait date cells and making Add event fill the detail panel width, restoring the design-a-c dots calendar look.
[Codex][260711003522] Reduced login screen typing lag by hiding unauthenticated calendar layout from rendering and removing the full-screen backdrop blur from the password screen.
[Codex][260711114941] Added production/RECURRING_EVENTS_PLAN.md covering custom repeat-rule event creation, modal interaction, series data model, APIs, edge cases, phased implementation, and acceptance criteria.
[Codex][260711004705] Improved portrait mobile layout for real browser viewports by using dynamic viewport height and compacting the calendar/header/detail spacing on shorter screens while keeping the normal 390x844 layout close to the design-a-c prototype.
[Codex][260711114738] Created production folder for non-project process artifacts, moved FRONTEND_SPEC.md and ui-preview into it, and added production/ to .gitignore.
[ClaudeCode][260711115457] file updated
[ClaudeCode][260711115501] 在 RECURRING_EVENTS_PLAN.md 末尾追加"Claude code的评价："章节，记录与现有代码对照后的评估与修正建议
[Codex][260711172708] 新增 production/RECURRING_EVENTS_IMPLEMENTATION_PLAN.md，按当前项目实际结构重写重复事件系列的首版范围、数据模型、API、时间规则、实施顺序和验收标准。
[Codex][260711173907] 根据评审意见补强重复事件实施计划：明确幂等查询与并发冲突二次读回、系列删除 batch、Modal 展开高度策略、预留字段语义及固定偏移不处理 DST 的首版约束。
[Codex][260711174455] 根据第二轮评审修订重复事件实施计划：统一每周空 weekdays 规则、补充无结束条件和计算候选上限、明确 ISO 日期字符串运算、移除重复时区字段、增加 series_id 索引、明确幂等键生成及精简创建响应。
[Codex][260711175015] 补充重复事件计划对纯日期全天事件的处理：要求日期格式与 all_day 一致、保持纯日期实例格式，并将 import.js 软删除复活风险明确为独立后续修复项。
[Codex][260711175442] 补充每年重复规则：明确闰年 2 月 29 日在非闰年跳过、不改为 2 月 28 日或 3 月 1 日，并加入对应验收标准。
[Codex][260711181445] 实施重复事件系列首版：新增 0002 迁移、event_series API、日期规则计算与 D1 batch 幂等写入，接入 New Event Repeat 表单、预览、系列标记和单次/系列删除，并更新 API/项目/测试/变更文档。
[ClaudeCode][260711175715] file updated
[ClaudeCode][260711175717] file updated
[ClaudeCode][260711175724] 在 CLAUDE.md 和 AGENTS.md 中新增 `production/` 文件夹说明：用途（生产过程中的计划草稿、多方案待选文件等暂时性文件）、已被 .gitignore 排除、禁止用 git diff/log/status 判断其变化，需直接重读磁盘文件
[ClaudeCode][260711175729] file updated
[Codex][260711184348] Rewrote the default categories to Math, Physics, CS, Other Subjects, Research, Projects, Leisure, and Tech; added migrations to rename existing event categories, reorder them, and remove nonstandard categories; updated project docs and frontend fallback category.
[Codex][260711201134] Created the personal calendar skill at C:\Users\asw\.codex\skills\calendar with production API instructions, category guidance, API references, and a PowerShell wrapper that reads CALENDAR_API_TOKEN.
[Codex][260711201134] Fixed the calendar skill PowerShell wrapper to send the Accept value through request headers for Windows PowerShell compatibility.
[Codex][260711201134] Configured the calendar skill to read CALENDAR_API_TOKEN from the user-local C:\Users\asw\.codex\calendar.env file and removed reliance on the system environment variable.
[Codex][260711201134] Documented recurring-series split usage, one-off exception usage, weekday numbering, confirmation requirements, and the current exception API limitation in the calendar skill.
[Codex][260711201134] Enforced UTF-8 handling for calendar writes: PowerShell now sends explicit UTF-8 JSON bytes with charset=utf-8, and the skill requires read-back verification for Chinese text.
[ClaudeCode][260711190526] file updated
[ClaudeCode][260711190537] file updated
[ClaudeCode][260711190541] file updated
[ClaudeCode][260711190545] file updated
[ClaudeCode][260711190549] file updated
[ClaudeCode][260711190553] file updated
[ClaudeCode][260711190602] file updated
[ClaudeCode][260711191018] Cache fetched event ranges and prefetch adjacent months to reduce blank flash on month navigation; fix left-clipped focus outline in event modal form fields (missing left padding on scrollable containers); auto-scroll time/repeat validation errors into view when they first appear.
[Codex][260711192942] 新增 production/EVENT_EDITING_API_PLAN.md，整理普通事件修改、仅跳过一次的 except、规则分段 split、系列修改 API、数据校验与事务边界；未修改业务代码。
[Codex][260711193100] 根据审查意见修订 EVENT_EDITING_API_PLAN.md：except 改为复用 generateInstances，补充 split 的新幂等键、旧实例清理和 occurrence_count 限制，明确时间校验兼容性与系列重建丢失实例级修改的副作用，并加入 exceptions 返回与错误码登记要求。
[Codex][260711193512] 根据第二轮交互审查修订 EVENT_EDITING_API_PLAN.md：split 迁移后续 exceptions，补充 split/PATCH 的 Idempotency-Key 重试语义，统一 exception 为硬删除，并清理 PATCH 后不再匹配新规则的 exceptions。
[Codex][260711193728] 根据第三轮交互审查修订 EVENT_EDITING_API_PLAN.md：明确 split 使用新 series 的 event_series.idempotency_key，PATCH 使用 event_operations 持久化幂等键与请求指纹，补充重试冲突处理及 body/header 幂等键约定。
[Codex][260711193945] 进一步统一 split 与 PATCH 的幂等实现：两者均使用 event_operations 保存操作 key、源 series 和请求指纹，新 series 保留独立的内部 idempotency_key，避免同一 key 无法校验不同 split 参数的问题。
[Codex][260711194210] 根据第四轮交互审查修订 EVENT_EDITING_API_PLAN.md：将 event_operations 明确拆分为 source_series_id/result_series_id，补充 PATCH 响应合同，并规定并发幂等键冲突按现有创建接口模式回查已有 operation。
[Codex][260711194325] 修正文档中 split 幂等记录的字段描述：Idempotency-Key 作为 operation 主键，source_series_id/result_series_id 保存源与结果 series，避免把操作键误写成 series 字段。
[Codex][260711195102] 按 EVENT_EDITING_API_PLAN.md 实现后端事件修改能力：新增 0005 event_exceptions/event_operations 迁移、except、系列 PATCH、split、幂等与并发回查、时间先后校验；更新 API_DOC/TEST_CHECKLIST/CHANGELOG；完成本地 API 冒烟验证。
[ClaudeCode][260711203755] file updated
[ClaudeCode][260711204044] file updated
[ClaudeCode][260711204054] fix: add CJK fonts (PingFang SC/Microsoft YaHei/Noto Sans CJK etc.) to body font-family stack in styles.css to fix Chinese tofu-box rendering
[Codex][260711205208] 修复事件分类改为新分类时颜色未同步：PUT 和批量导入在未显式提供 color 时自动使用分类颜色，同时保留显式自定义颜色。
[Codex][260711205427] 支持事件颜色填写 default：渲染时使用所属分类颜色，批量导入将 default 归一为跟随分类颜色，并保留自定义颜色。
[Codex][260711205434] 加强 default 颜色值的前端类型判断，避免异常数据导致渲染报错。
[ClaudeCode][260711224046] file updated
[ClaudeCode][260711224054] 新增 functions/mcp/index.js：最小版 MCP Streamable HTTP 端点，实现 initialize/tools/list/tools/call，仅暴露只读工具 list_events，无认证（阶段1）
[ClaudeCode][260711224449] file updated
[ClaudeCode][260711224458] file updated
[ClaudeCode][260711224504] file updated
[ClaudeCode][260711224609] MCP阶段2：新增工具 list_categories(公开)、create_event/update_event/delete_event(需 Bearer MCP_WRITE_TOKEN，fail-closed)，镜像现有REST逻辑含分类颜色继承；.dev.vars(.example) 增加 MCP_WRITE_TOKEN；未改动现有REST API
[ClaudeCode][260711225216] file updated
[ClaudeCode][260711225247] file updated
[ClaudeCode][260711225254] file updated
[ClaudeCode][260711225302] file updated
[ClaudeCode][260711225318] file updated
[ClaudeCode][260711225403] file updated
[ClaudeCode][260711225431] file updated
[ClaudeCode][260711225505] file updated
[ClaudeCode][260711225518] file updated
[ClaudeCode][260711225525] file updated
[ClaudeCode][260711225531] file updated
[ClaudeCode][260711225639] file updated
[ClaudeCode][260711225815] file updated
[ClaudeCode][260711225823] 实现完整 OAuth 2.1+PKCE 让 /mcp 可作 Claude Custom Connector：新增 _lib/oauth.js、.well-known/oauth-{protected-resource,authorization-server}.js、oauth/{register,authorize,token}.js、migration 0006_oauth.sql（clients/codes/refresh_tokens）；/mcp 改为统一要求有效 OAuth access token(aud 绑定)，MCP_WRITE_TOKEN 降级为本地调试旁路；严格校验 redirect_uri/state/PKCE/code 单次使用与过期/token 过期与 audience；新增 MCP_DEPLOY.md；本地 30 项端到端测试全部通过，REST API 不受影响
[ClaudeCode][260711230534] file updated
[ClaudeCode][260711230743] 部署 MCP OAuth 到生产：远程 D1 应用 0005+0006 迁移(建 oauth_clients/codes/refresh_tokens)；修正 wrangler.toml 项目名 ai0506-calendar→calendar；wrangler pages deploy 到 calendar 项目 main 分支；线上验证 .well-known 两个元数据、/mcp 未认证 401、DCR 注册、授权页渲染、token 端点(SESSION_SECRET 已配置)均正常；清理探测数据
[ClaudeCode][260711232215] file updated
[ClaudeCode][260711232225] file updated
[ClaudeCode][260711232248] file updated
[ClaudeCode][260711232321] file updated
[ClaudeCode][260711232327] file updated
[ClaudeCode][260711232356] file updated
[ClaudeCode][260711232430] MCP 新增重复事件工具 create/get/update/delete_event_series（复用 recurrence.js/series.js，支持 daily/weekly/monthly/yearly，自动派生 start_date 与 monthly_day，MCP 层自动生成 idempotency_key）；工具增至 9 个；refresh token 有效期 30 天→1 年（轮换重置，保持使用即永不重新授权）；本地 21 项测试全通过
[ClaudeCode][260711233145] file updated
[ClaudeCode][260711233153] file updated
[ClaudeCode][260711233202] file updated
[ClaudeCode][260711233220] file updated
[ClaudeCode][260711233232] file updated
[ClaudeCode][260711233251] file updated
[ClaudeCode][260711233257] file updated
[ClaudeCode][260711233303] file updated
[ClaudeCode][260711233339] file updated
[ClaudeCode][260711233345] file updated
[ClaudeCode][260711233418] file updated
[ClaudeCode][260711233456] MCP 新增 skip_occurrence/restore_occurrence/split_series（复用 exceptions/split 逻辑，split 跳过 event_operations 幂等表），工具增至 12；工具描述优先推荐 skip/split 而非整体改/删；颜色支持 "default"（跟随分类色）：create/update event 与 series 均解析，字段说明已更新；本地 22 项测试全通过
[Codex][260712000944] Added production/DEADLINES_PLAN.md defining the first-version single Deadline model, shared categories with events, database migration, REST API, frontend rendering, validation rules, implementation phases, and explicit non-goals for recurring deadlines.
[Codex][260712001807] Revised production/DEADLINES_PLAN.md after compatibility review: fixed date-based deadline range queries and Asia/Shanghai all-day semantics, added explicit Pages Functions routes and idempotent state-transition rules, preserved legacy exports, closed external_id conflict behavior, aligned frontend caching/rendering with the custom app, and deferred import/MCP extensions.
[Codex][260712002343] Refined the Deadline implementation plan with target-state conditional UPDATE SQL for complete/reopen, frontend render-time status recomputation, julianday-based timezone-aware ordering, strict calendar/date-time validation, explicit include_completed parsing, completed-overdue semantics, a matching due-date expression index, and complete project documentation sync requirements.
[Codex][260712002714] Corrected the Deadline plan's frontend DTO to retain completedAt, made the D1 expression index a required migration assumption with an explicit success test, normalized blank external IDs to NULL, and clarified that deleted is internal-only and never exposed by list/detail APIs.

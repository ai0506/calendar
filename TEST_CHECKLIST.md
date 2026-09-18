# AI0506 Calendar — 测试清单 (TEST_CHECKLIST)

> 每个阶段实现后按此清单逐项验证。`[ ]` 未测，`[x]` 通过。
> 本地环境：`wrangler d1 migrations apply calendar-db --local` + `wrangler pages dev`。
> 测试工具：PowerShell `Invoke-RestMethod` 或 `curl`。

## 认证 (Auth)
- [x] 未认证访问 `GET /api/events` → 401
- [x] `POST /api/auth/login` 正确密码 → 200 且返回 `Set-Cookie`
- [x] `POST /api/auth/login` 错误密码 → 401
- [x] `GET /api/auth/status` 带 Cookie → `authenticated: true`
- [x] `POST /api/auth/logout` → 清除 Cookie，之后访问 → 401 / status false
- [x] 携带有效 `Authorization: Bearer <API_TOKEN>`（无 Cookie）→ 事件端点可访问
- [x] 无效 Token → 401
- [x] 密码 / Token / SESSION_SECRET 均来自环境变量，代码中无硬编码
- [x] localhost 开发环境登录 Cookie 不带 `Secure`，生产域名 Cookie 仍带 `Secure`

## 事件 CRUD (Events)
- [x] `POST /api/events` 创建 → 201，返回带 `id` 的对象
- [x] `start_time` 带时区偏移（如 `+08:00`）原样保存，未被转成 UTC
- [x] `GET /api/events?from=&to=` 范围过滤正确
- [x] `GET /api/events?category=` 分类过滤正确
- [x] `GET /api/events/:id` 返回单个事件；不存在 → 404
- [x] `PUT /api/events/:id` 更新字段，`updated_at` 刷新
- [x] `DELETE /api/events/:id` 软删除：`deleted_at` 被设置，列表中不再出现，数据仍在表中

## 重复事件系列 (Event Series)
- [x] 本地迁移 `0002_recurrence.sql` 成功应用，已有普通事件保持可读
- [x] 每日规则按结束日期生成正确数量
- [x] 每周规则支持多个星期几，未选择星期时服务端拒绝空数组
- [x] 每月 31 日在不存在的月份跳过，不改为月末
- [x] 每年 2 月 29 日在非闰年跳过，并在下一个闰年恢复
- [x] 纯日期 `start_time` 要求 `all_day=true`，实例保持纯日期格式
- [x] 无结束条件、实例数超过 366、候选计算超过 10,000 次时拒绝
- [x] 相同 `idempotency_key` 重试不会重复创建系列
- [x] 系列创建使用原子 batch，失败时不留下部分实例
- [x] `GET /api/event-series/:id` 返回系列规则和未删除实例
- [x] 删除单个系列实例不影响其他实例
- [x] 删除整个系列使用 batch 软删除系列和全部实例
- [x] `POST /api/event-series/:id/exceptions` 跳过有效实例；系列详情返回 exception
- [x] except 拒绝不属于规则的时间 → `not_an_occurrence`
- [x] 删除 exception 恢复原实例
- [x] `POST /api/event-series/:id/split` 切分日期系列，旧段后续实例不重复显示
- [x] split 将后续 exceptions 迁移到新系列
- [x] split 相同 `Idempotency-Key` 重试不重复切分
- [x] `PATCH /api/event-series/:id` 重建实例并返回更新摘要
- [x] 系列 PATCH 仅修改标题时保留原 category / color / weekdays 等未提交字段（MCP 与 REST）
- [x] 系列 PATCH 可用 `null` 显式清空可选字段，且损坏的 weekdays JSON 不会让更新直接崩溃
- [x] PATCH 相同 `Idempotency-Key` 重试不重复重建
- [x] PATCH 后不再匹配新规则的 exceptions 被清理
- [x] 前端 Repeat 弹窗在横屏 / 竖屏真实浏览器中视觉检查

## 分类 (Categories)
- [x] `GET /api/categories` 返回 8 个种子分类，颜色各异
- [x] `POST /api/categories` 创建新分类 → 201
- [x] 重复分类名 → 409
- [x] 未注册的 `category` 会被以下写路径拒绝为 `validation_error`：`POST/PUT /api/events`、`POST /api/event-series`、`PATCH /api/event-series/:id`、`POST/PUT /api/deadlines`，以及 MCP 的 `calendar_create_event`/`calendar_create_event_series`/`calendar_update_event_series`/`calendar_create_deadline`/`calendar_update`
- [x] `POST /api/events/import` 中单条事件 `category` 非法时计入 `skipped`，不影响批次其余条目
- [x] `category` 留空 / `null` 不触发校验（清空分类仍被允许）
- [ ] 生产环境针对未注册 `category` 的端到端冒烟验证（本地 `node --check` 与单元测试已过，尚未过真实 D1 联调）

## 批量导入 (Import)
- [x] `POST /api/events/import` 首次导入 → created 计数正确
- [x] 相同 `(source, external_id)` 再次导入 → created=0, updated=1，证明去重生效
- [x] 不同 `external_id` → 正常新建
- [x] 已记录已知问题：soft delete 后相同 `(source, external_id)` 再导入当前会触发唯一约束错误（见 `BUGS.md`）

## 导出 (Export)
- [x] `GET /api/export?format=json` → `application/json`，结构正确
- [x] `GET /api/export?format=csv` → `text/csv`，可被 Excel 打开
- [x] `GET /api/export?format=md` → `text/markdown`，格式可读
- [x] 导出不包含软删除事件

## Apple Calendar ICS 订阅
- [x] ICS serializer unit test covers UTC timed events, all-day exclusive end dates, escaped Chinese-safe text structure, tags, and stable recurring-instance UIDs (`npm run test:ics`).
- [ ] 配置本地 `ICS_SUBSCRIPTION_TOKEN` 后，全部与分类 URL 均返回 `text/calendar; charset=utf-8`；错误 token / 分类 ID 返回 404。
- [x] macOS Calendar 实际添加生产全部 Event 订阅：订阅成功显示为 `AI0506 Calendar`，设置为蓝色并每日刷新（当前这台 Mac 只提供 On My Mac，未配置可选 iCloud 位置）。
- [ ] 在 macOS Apple Calendar 实际订阅全部和一个分类源，确认中文标题、定时/全天事件、Tags 文字和分类颜色设置均可见。
- [ ] 创建、修改、删除普通 Event 及修改重复系列后，等待 Apple Calendar 刷新并确认未产生重复事件。

## Tags

- [x] Local D1 migration `0010_tags.sql` applies successfully.
- [x] Tag validation rejects duplicate IDs and more than five item tags (`npm run test:tags`).
- [x] Web smoke test creates an Event with a selected tag and records no browser console errors.
- [x] Event/Deadline list and export tag reads use range-derived subqueries instead of dynamic ID `IN (...)` bindings, keeping D1 bound parameters below 100.
- [x] Android tag create/edit and recurring-series edit paths compile (`:app:compileDebugKotlin`).
- [x] Production D1 migration `0010_tags.sql` has been applied and the Tag-capable Pages build deployed.
- [ ] Authenticated production Tag create/edit/filter smoke test.

## 安全 / 卫生
- [x] `.env` / `.dev.vars` 已被 `.gitignore` 忽略，未提交
- [x] 响应错误信息不泄露敏感信息
- [x] 每阶段完成后 `updates.md` 有对应记录

## Phase 1 收尾验证记录

- 2026-07-10：本地 `wrangler pages dev` + local D1 冒烟测试通过主要 Phase 1 API 路径。
- 2026-07-10：`node --check` 通过认证相关文件语法检查。
- 2026-07-10：Wrangler 3.114.17 会提示 compatibility date 回退，已在 `BUGS.md` 记录为低优先级环境问题。
# Notifications Phase 1

- [x] 提醒计划、配置校验、派发状态和通知去重的单元测试通过（`npm run test:reminders`）。
- [x] 过期提醒回归：过去的全天 Event、到期后的 Deadline 提前提醒和超过 24 小时的最终 due 提醒均标为 skipped；宽限期内使用 overdue 文案。
- [x] Web 模拟 API 浏览器回归：首次轮询不重弹历史未读，打开通知中心不自动申请权限，新通知正常提示，点击后标已读并定位详情。
- [x] Web 通知中心 390×844 竖屏回归：权限说明、未读状态、类型标签和提醒计划时间完整显示，弹窗不超出视口。
- [x] Deadline priority、due/due_today、complete/reopen 相关单元测试通过（`npm run test:deadlines`）。
- [x] 重复系列 PATCH 的回归测试通过（`npm run test:series-patch`）。
- [ ] 真实本地 D1 + Pages Functions 联调：普通 Event、全天 Event、DDL 和通知 API 全链路验证。
- [ ] 真实浏览器 Notification 授权后的系统弹窗、通知列表全部已读和生产数据人工验收。

## 2026-07-13 验证记录

- `npm run test:deadlines`：通过。
- `npm run test:reminders`：通过。
- `npm run test:series-patch`：通过。
- Node 输出提示 `package.json` 未声明 ESM 类型；不影响当前测试结果，后续可在确认 Wrangler 兼容性后单独处理。

## Android 原生客户端（Kotlin + Jetpack Compose）

- [x] `:app:testDebugUnitTest`：CalendarTime 覆盖全天/定时 Event、上海 `+08:00`、非法和倒置时间、Deadline 时间校验。
- [x] `:app:assembleDebug`：Debug APK 构建成功。
- [x] `:app:lintDebug`：Android 静态检查通过。
- [x] `:app:bundleRelease`：Release 变体能够完成 bundle 编译。
- [ ] 使用私有 release keystore 构建并验证可用于商店上传的已签名 AAB。
- [x] 本地 Pages + D1 冒烟联调：Cookie 登录、Event 创建/列表 reminders/完整编辑/软删除、Deadline 创建/编辑/完成/重开/软删除、重复系列创建/PATCH/删除全部通过。
- [x] Android Debug 包连接本地 Pages + D1 的真实登录与核心交互验收：API 35 模拟器完成安装启动、Cookie 登录、月历加载、Event/Deadline 创建、Deadline 完成与重开，以及强制结束进程后的会话恢复。
- [ ] 真机 Android 安装与登录验收。
- [x] Android 13+ 通知授权、定时提醒、修改后去重和设备重启恢复验收：API 35 模拟器中，真实 Event 闹钟按时显示在系统通知栏；修改 Event 的时间后旧闹钟被替换且新闹钟保留；模拟器重启后系统 BOOT_COMPLETED 广播从私有缓存重新登记待触发闹钟。
- [x] 跨设备提醒收敛验收：API 35 模拟器先登记未来 Event 闹钟，再通过本地 Pages+D1 模拟网页端软删除并重启 Android 应用；应用重新读取服务端月份后，该时间点不再出现在 AlarmManager 待触发列表，确认不会保留远端已删除的提醒。
- [x] API 35 Pixel Tablet 模拟器（2560×1600）布局验收：月/周/日可切换，宽屏右侧详情栏稳定显示，New Event/Deadline 弹窗字段与底部操作按钮完整可见。
- [x] 短屏横向模拟器回归：紧凑顶栏、固定高度分类占位、月格日期/圆点锚定布局均已验证，月格数字和圆点完整可见。
- [x] 按真实设备比例复验：手机竖屏 1260×2880 隐藏品牌、月历优先获得上半屏高度，日期/圆点完整可见；平板横向 2800×1840 保留完整品牌栏和宽屏详情分栏（API 35 模拟器、本地 Pages+D1 已登录数据）。
- [x] Android Tag 元数据非阻塞加载回归：Event/Deadline/Category 请求完成后月历可先渲染，Tag 与分类推荐延迟返回不阻塞主数据；切换到预取月份不会用空 Tag 缓存覆盖已加载数据。
- [x] Android Tag 选择器双尺寸回归：1260×2880 手机和 2800×1840@480dpi 平板默认显示 6 项（三列两行），Show more 展开全部 10 项，Event/Deadline 的 Cancel/Create 操作栏始终可见。
- [x] Android 顶栏与图标回归：1260×2880 手机的 Today/通知/New 保持单行且间距清楚；2800×1840@480dpi 平板的 Today 导航组与 Month/Week/Day 操作组明确分隔；网页 favicon 生成的自适应图标在模拟器圆形启动器遮罩下无裁切。
- [ ] 手机和大屏设备的月/周/日布局、创建/编辑表单、通知跳转人工验收。
- [ ] 生产 Cloudflare API 与正式数据库联调验收。

## Academics 分类与 Subject 子类（migration 0012）

- [x] `npm run test:subjects`：Category / Subject 联动校验（普通分类拒绝 subject、科目不存在 / 跨分类 / 已停用、分类降级清空 subject）通过。
- [x] 既有单测全部回归通过：`test:deadlines` / `test:reminders` / `test:series-patch` / `test:tags` / `test:ics` / `test:oauth-scopes`。
- [x] 本地 D1 迁移：Math / Physics / CS / Other Subjects 的 Event、Deadline、Event Series 全部改挂 `Academics` + 对应 `subject_id`；旧分类行标记 `archived = 1` 而非删除；`Mathematics`、`Personal` 两类历史脏数据一并归位。
- [x] 颜色归一化：等于所属分类色的历史 `color` 被清空成 `NULL`，真正的自定义颜色保留；原值写入 `migration_0012_backup`。
- [x] REST 写路径：Academics + 有效 subject 成功；普通分类带 subject、未知 subject、归档分类写入均返回 `validation_error`。
- [x] 分类降级：只传 `category`（academics → 普通分类）时 `subject_id` 自动清空，不会被残留 subject 判为非法；Event PUT、Deadline PUT、Series PATCH 三条路径均验证。
- [x] Event Series：创建时 subject 落到系列和全部实例；PATCH 改分类后系列与实例的 `subject_id` 一并清空。
- [x] MCP：`calendar_list_subjects` 返回 5 个科目；`calendar_create_event` 带 subject 成功且 `color` 为 `null`（不再快照分类色）；非法组合与归档分类被拒；`calendar_list_categories` 不再返回归档分类。
- [x] ICS：归档分类 feed（`?category=cat-physics`）与新的科目 feed（`?subject=sub-physics`）返回同一批事件，`X-WR-CALNAME` 为 `AI0506 · Physics`；普通分类 feed 不受影响。
- [x] Web 浏览器回归（本地 Pages + D1）：侧栏 Academics 下缩进列出 5 个科目并可按科目单独筛选；New Event / New Deadline 只在选中 Academics 时展开科目色块，切到普通分类后科目行消失且标签建议随之切换；创建的事件用科目色渲染、数据库中 `color` 为 NULL；agenda 与详情显示科目名；无控制台报错。
- [ ] 生产 D1 迁移与迁移后回归（未执行，待授权）。

## 独立课程层（migration 0013 / 0014）

- [x] 本地 D1 应用 migration 0013，创建 Term / Course / CourseSlot / CourseOverride，且不改动 Event / Deadline 表生命周期。
- [x] `GET /api/course-schedule` 无课程或无覆盖学期时返回空数组，并拒绝非法日期范围。
- [x] Web 课程投影接入月/周/日/竖屏数据刷新，课程颜色来自 Subject，不占用 Event/Deadline 的重叠布局。
- [x] Web 仅显示“这一节课”和“今天所有课”两个请假入口；通用 `makeup` / `move` / `add` 不开放给 Web。
- [x] 根据 G11 个人课表写入 1 个 Term、13 个 Course、40 个 CourseSlot，并验证课程标题、Subject 归类和教室来源。
- [ ] 补充单双周、请假、放假、调休、补课和冲突组合测试。

### 课程的显示优先级与界面稳定性（2026-09-14）

- [x] 横屏月视图：课程色条画在日期格顶部，事件 / Deadline 的 chip 数量与「+N more」不因课程而减少。
- [x] 竖屏月视图：Event / Deadline 仍是圆点，课程是圆点下方单独一排细色条；有课与无课的格子高度一致。
- [x] 当日详情顺序为 Due soon → 当天事件 → Courses → Categories → Tags，课程不再排在最前。
- [x] 课程列表是定高滚动槽位：选中 7 节课的工作日与 0 节课的周末，Categories 标题和 agenda 列表的位置完全不变（实测都在 846px / 420px）。
- [x] 无课的日子显示空态而不是整块消失。
- [x] 周 / 日视图课程是浅色背景块，事件盖在其上，不参与重叠分栏。
- [ ] 请假后撤销（阻塞于 BUG-0006，暂无入口）。

### 自定义 tooltip（替代原生 title）

- [x] 全站没有残留的动态 `title=` 属性（`data-delete-title` 等数据属性除外）。
- [x] 悬停月视图课程色条、Deadline chip、分类 / 科目色块在 80ms 内弹出气泡，内容正确。
- [x] 气泡不被 `overflow:hidden` 的祖先（月视图格子、chip）裁掉。
- [x] 鼠标移开、滚动、点击、按键后气泡立即消失，页面上只保留一个 `.tip` 节点。
- [x] 时间输入框获得焦点时不弹气泡。
- [ ] 触屏设备（`hover: none`）实机确认不绑定、tap 后无残留气泡。

### 弹窗色块选中环

- [x] New Event / New Deadline 选中最左边的 Academics 分类，白色选中环是完整圆环，没有被弹窗左边缘裁切。
- [x] 表单内容左边缘与改动前一致（色块与 Title 输入框同为 447.5px @1280×800），未因修复而整体位移。
- [x] 窄宽度（780×620，弹窗为 sheet 模式）下同样不裁切。

## Deadline × Course 关联（migration 0015）

后端已实现，客户端消费方是 Reminders；Calendar 自家前端本期不涉及，所以没有 Web 回归项。

- [x] `npm run test:deadline-course`：库级校验（空值、类型、缺 subject、Course 不存在、Subject 不匹配、active / inactive Course、两侧空白规范化）。
- [x] `npm run test:deadline-course-routes`：路由级（用 `tests/helpers/fake-d1.mjs` 的 D1 桩，不连真实数据库）
  - [x] `GET /api/course-catalog` 返回 `id/name/subject_id/active` 四个字段，**包含 inactive Course**，active 排在前面。
  - [x] `POST /api/deadlines` 带合法 `course_id` 返回 201 且落库；不带时落 `NULL`。
  - [x] `POST` 关联 inactive Course 成功（已冻结的产品语义：停用 / 学期结束后仍可新建关联）。
  - [x] `POST` 的四类拒绝：Course 不存在、Course 与 `subject_id` 不匹配、有 `course_id` 无 `subject_id`、普通分类（被 Category/Subject 校验先拦下），且均不写库。
  - [x] `PUT` 改 `course_id`、清成 `null`、`GET /api/deadlines/:id` 回传该字段。
  - [x] `PUT` 只改 `subject_id` 时按 merged state 拒绝残留的 `course_id`（400），原行不变；同时给出新 `course_id` 则通过。
  - [x] MCP：`calendar_create_deadline` 带 `course_id` 成功并落库；`calendar_get_deadline` / `calendar_list_deadlines` / `calendar_complete_deadline` 回传 `course_id`；`calendar_update` 改 / 清 `course_id` 生效，Subject 不匹配被拒且不改库。
  - [x] MCP 跨类型串味：`calendar_update` `type=event` 传 `course_id` → `course_id is not valid for type="event"`。
- [x] 本地 D1 应用 migration 0015，`PRAGMA table_info(deadlines)` 中存在 `course_id`。
- [ ] 生产 D1 迁移 0015 与部署后回归（未执行，待授权）。
- [ ] 真实请求验收：带 Bearer Token 调 `GET /api/course-catalog` 与带 `course_id` 的 Deadline 写入（未执行，待授权）。
- [x] Course 被物理删除时的行为：本地 D1 实测，删除仍被 Deadline 引用的 Course 返回 `FOREIGN KEY constraint failed`（等效 RESTRICT，不会留下悬空引用）；写入不存在的 `course_id` 也在 DB 层被同一约束挡下。没有任何 API 能删除 Course。

## MCP 工具合并（update / delete）

- [x] `calendar_update` `type=event` 只改标题，`start_time` 保持不变
- [x] `calendar_update` `type=deadline` 改 `priority` 生效
- [x] 跨类型串味被拒：`type=event` 传 `priority` → `priority is not valid for type="event"`
- [x] 跨类型串味被拒：`type=deadline` 传 `start_time`/`reminders` → 两个字段名都在报错里列出
- [x] 缺 `type` 被拒；`type` 取非法值（如 `series`）被拒
- [x] `calendar_delete` 两种 type 都返回 `{id, deleted:true}`
- [x] 旧工具名 `calendar_delete_event` 等已不存在，调用返回「未知工具」
- [x] MCP 写工具不再暴露 `color`；不传 color 创建事件时 `color` 落 NULL、跟随科目色
- [x] `calendar_update` 不再暴露 `source` / `external_id`（原 `calendar_update_deadline` 公布了但运行时必拒）

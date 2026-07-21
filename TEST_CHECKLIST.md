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

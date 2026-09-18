# AI0506 Calendar — 已知问题 (BUGS)

> 记录已知缺陷与待办排查项。修复后移到 CHANGELOG.md 并在此标记已解决。

## 当前状态

Phase 1 核心功能已完成：认证、events CRUD、categories、Subject、import、export、重复系列、Deadline、通知、ICS 订阅、独立课程层、Web 前端和 D1 绑定与迁移（0001–0014）均已实现并部署到生产。迁移 0015（`deadlines.course_id`）与 `GET /api/course-catalog` 已在本地完成并通过测试，**尚未上生产**。当前仍需完成浏览器通知权限验收、Android 真机验收和完整的浏览器端到端回归。

### [BUG-0001] localhost 开发环境 Secure Cookie 导致登录态不可用
- 状态：Fixed
- 严重程度：Medium
- 发现日期：2026-07-10
- 影响：前端 / 本地开发
- 复现步骤：
  1. 在 `http://localhost:8788` 调用 `POST /api/auth/login`
  2. 浏览器收到带 `Secure` 的 Session Cookie
  3. HTTP localhost 下浏览器不回传该 Cookie，`GET /api/auth/status` 仍为未登录
- 期望行为：生产 HTTPS 保持 `Secure`；localhost 本地开发可保存并回传 Cookie。
- 实际行为：已修复。`localhost` / `127.0.0.1` / `[::1]` 请求生成的 Cookie 不带 `Secure`，其他域名仍带 `Secure`。
- 备注 / 修复：不改变 API contract，不改变生产认证签名逻辑。

### [BUG-0002] soft delete 后相同 `(source, external_id)` 再导入会失败
  - 状态：Fixed
- 严重程度：Medium
- 发现日期：2026-07-10
- 影响：Import API / 数据恢复或重复导入
- 复现步骤：
  1. `POST /api/events/import` 导入带 `source` + `external_id` 的事件
  2. `DELETE /api/events/:id` 软删除该事件
  3. 再次导入相同 `source` + `external_id`
- 期望行为：应恢复/更新旧事件，或明确跳过并返回可控结果。
- 实际行为：当前导入查询只查 `deleted_at IS NULL`，但 D1 唯一索引仍包含软删除行，重新插入会触发唯一约束错误并返回 500。
- 备注 / 修复：本次只记录，不修改 D1 schema。Phase 2 前端普通 CRUD 不受影响，但后续 import 恢复逻辑需要单独处理。

### [BUG-0003] 本地 Wrangler 版本低于当前 compatibility_date
- 状态：Open
- 严重程度：Low
- 发现日期：2026-07-10
- 影响：本地开发 / 部署一致性
- 复现步骤：
  1. 运行 `npm run dev`
    2. （修复前）Wrangler 3.114.17 提示不支持 `compatibility_date = "2026-01-01"`，本地回退到 `2025-07-18`
- 期望行为：本地运行时支持当前 compatibility date。
  - 实际行为：升级前本地可运行，但有版本回退警告。
  - 备注 / 修复：2026-07-13 已升级项目开发依赖至 Wrangler 4.110.0；`npx wrangler --version` 与本地 D1 migration 均通过，不再出现 compatibility date 回退警告。

### [BUG-0004] Web 通知重复弹出并补发陈旧提醒
- 状态：Fixed
- 严重程度：High
- 发现日期：2026-07-19
- 影响：Web 前端 / Notification API / Reminder 派发
- 复现步骤：保留未读通知后刷新页面，或关闭网页直到 Event/Deadline 提醒过期后再重新打开。
- 期望行为：历史未读只更新角标；只提示本次会话新到达的通知；过期提醒不集中补发；点击通知打开目标详情。
- 实际行为：修复前会重弹历史未读，过期全天 Event 可能仍显示 today，Deadline 多阶段提醒可能集中出现，点击只标记已读。
- 备注 / 修复：首次轮询建立历史基线；加入 Event/Deadline 过期规则和 due 24 小时宽限；权限改为显式开启；通知点击会标已读并定位目标。

### [BUG-0005] category 字段无合法性校验，AI Agent 可凭空写入未注册分类名
- 状态：Fixed
- 严重程度：Medium
- 发现日期：2026-07-27
- 影响：Event / Deadline / Event Series 写入路径（REST 与 MCP）
- 复现步骤：
  1. 通过 `calendar_create_event`（或任意写入端点）传入一个不在 `categories` 表中的 `category` 值，例如 `"UXR课程"`
  2. 请求成功创建/更新，事件被写入这个自造分类名
  3. 该事件在按分类过滤、分类默认配色等场景下匹配不到任何 `categories` 行
- 期望行为：`category` 应视为对 `categories.name` 的引用，非法值应在写入前被拒绝。
- 实际行为：`category` 此前只做「是字符串」的校验，未检查是否已注册；生产库中已有一条这样的脏数据（事件 `1ebae044-663e-41bb-beea-c1320d57593d`，UXR课程加课），已手动改回 `Research`。
- 备注 / 修复：新增 `functions/_lib/categories.js` 的 `ensureCategoryExists`，接入全部 9 个写路径（events POST/PUT、events/import、event-series POST/PATCH、deadlines POST/PUT，以及对应的 6 个 MCP 工具）；非法分类名统一返回 `validation_error`（import 中计入 `skipped`）。MCP 的 `category` 字段描述同步更新，提示需先用 `calendar_list_categories` 核对合法值。

### [BUG-0006] 课程请假写入后没有撤销入口
- 状态：Open
- 严重程度：Medium
- 发现日期：2026-09-14
- 影响：课程层 / Web 前端 / API
- 复现步骤：
  1. 在当日详情的 Courses 列表里点 `Leave`（或标题行的 `Leave all day`）
  2. `POST /api/course-overrides` 写入一条 `cancel` / `cancel_day` 记录，该节（或当天全部）课程从投影中消失
  3. 想恢复时，前端没有任何入口，API 也没有 `DELETE /api/course-overrides/:id`
- 期望行为：请假可撤销，或至少提供一个删除 Override 的端点。
- 实际行为：只能直接改 D1 删除那一行。点击时有一次 `confirm` 二次确认，但确认后不可逆。
- 备注 / 修复：`functions/_lib/course-schedule.js` 目前只实现了 `createCourseLeave`。
  计划里的 `makeup` / `move` / `add` 同样未开放，一并等课程层第二阶段处理。

## 模板

```
### [BUG-0001] 标题
- 状态：Open / In Progress / Fixed
- 严重程度：Low / Medium / High
- 发现日期：YYYY-MM-DD
- 影响：数据库 / API / 前端 / 部署
- 复现步骤：
  1. ...
- 期望行为：
- 实际行为：
- 备注 / 修复：
```

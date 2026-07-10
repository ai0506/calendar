# AI0506 Calendar — 已知问题 (BUGS)

> 记录已知缺陷与待办排查项。修复后移到 CHANGELOG.md 并在此标记已解决。

## 当前状态

Phase 1 后端基础已完成：认证、events CRUD、categories、import、export、D1 绑定与迁移均已实现。本地冒烟测试已覆盖主要 API 路径。

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
- 状态：Open
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
  2. Wrangler 3.114.17 提示不支持 `compatibility_date = "2026-01-01"`，本地回退到 `2025-07-18`
- 期望行为：本地运行时支持当前 compatibility date。
- 实际行为：本地可运行，但有版本回退警告。
- 备注 / 修复：建议后续升级 Wrangler 4；本次按要求不引入新依赖，未修改 `package.json`。

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

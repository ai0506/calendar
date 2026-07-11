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
- [ ] 前端 Repeat 弹窗在横屏 / 竖屏真实浏览器中视觉检查

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

## 安全 / 卫生
- [x] `.env` / `.dev.vars` 已被 `.gitignore` 忽略，未提交
- [x] 响应错误信息不泄露敏感信息
- [x] 每阶段完成后 `updates.md` 有对应记录

## Phase 1 收尾验证记录

- 2026-07-10：本地 `wrangler pages dev` + local D1 冒烟测试通过主要 Phase 1 API 路径。
- 2026-07-10：`node --check` 通过认证相关文件语法检查。
- 2026-07-10：Wrangler 3.114.17 会提示 compatibility date 回退，已在 `BUGS.md` 记录为低优先级环境问题。

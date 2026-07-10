# AI0506 Calendar — 测试清单 (TEST_CHECKLIST)

> 每个阶段实现后按此清单逐项验证。`[ ]` 未测，`[x]` 通过。
> 本地环境：`wrangler d1 migrations apply calendar-db --local` + `wrangler pages dev`。
> 测试工具：PowerShell `Invoke-RestMethod` 或 `curl`。

## 认证 (Auth)
- [ ] 未认证访问 `GET /api/events` → 401
- [ ] `POST /api/auth/login` 正确密码 → 200 且返回 `Set-Cookie`
- [ ] `POST /api/auth/login` 错误密码 → 401
- [ ] `GET /api/auth/status` 带 Cookie → `authenticated: true`
- [ ] `POST /api/auth/logout` → 清除 Cookie，之后访问 → 401
- [ ] 携带有效 `Authorization: Bearer <API_TOKEN>`（无 Cookie）→ 事件端点可访问
- [ ] 无效 Token → 401
- [ ] 密码 / Token / SESSION_SECRET 均来自环境变量，代码中无硬编码

## 事件 CRUD (Events)
- [ ] `POST /api/events` 创建 → 200，返回带 `id` 的对象
- [ ] `start_time` 带时区偏移（如 `+08:00`）原样保存，未被转成 UTC
- [ ] `GET /api/events?from=&to=` 范围过滤正确
- [ ] `GET /api/events?category=` 分类过滤正确
- [ ] `GET /api/events/:id` 返回单个事件；不存在 → 404
- [ ] `PUT /api/events/:id` 更新字段，`updated_at` 刷新
- [ ] `DELETE /api/events/:id` 软删除：`deleted_at` 被设置，列表中不再出现，数据仍在表中

## 分类 (Categories)
- [ ] `GET /api/categories` 返回 8 个种子分类，颜色各异
- [ ] `POST /api/categories` 创建新分类 → 200
- [ ] 重复分类名 → 409

## 批量导入 (Import)
- [ ] `POST /api/events/import` 首次导入 → created 计数正确
- [ ] 相同 `(source, external_id)` 再次导入 → created=0（更新或跳过），证明去重生效
- [ ] 不同 `external_id` → 正常新建

## 导出 (Export)
- [ ] `GET /api/export?format=json` → `application/json`，结构正确
- [ ] `GET /api/export?format=csv` → `text/csv`，可被 Excel 打开
- [ ] `GET /api/export?format=md` → `text/markdown`，格式可读
- [ ] 导出不包含软删除事件

## 安全 / 卫生
- [ ] `.env` / `.dev.vars` 已被 `.gitignore` 忽略，未提交
- [ ] 响应错误信息不泄露敏感信息
- [ ] 每阶段完成后 `updates.md` 有对应记录

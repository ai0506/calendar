# AI0506 Calendar

私人日历系统：管理个人学习、科研、考试、项目与生活安排。单用户，不是公开 SaaS。
正式入口 `calendar.ai0506.com`，跑在 Cloudflare Pages + Pages Functions + D1 上。

## 能力

- 事件（含重复系列、异常、拆分、软删除）、Deadline（优先级 / 完成 / 重开）、标签、分类与科目
- 两级分类：普通 Category + Academics 专属的 Subject（Math / Physics / CS / English / Other Subjects）
- 独立课程层：Term / Course / CourseSlot / CourseOverride，只做只读投影，不写入事件
- 提醒与站内通知中心；导入 / 导出（JSON / CSV / MD）
- 私有 ICS 订阅（全部事件 / 每个分类 / 每个科目）与公开的 `/schedule.ics` 课表源
- MCP 服务端（`/mcp`，OAuth 授权），供 AI 客户端读写日历

## 目录

| 路径 | 说明 |
|---|---|
| `public/` | Web 前端（主日历）、静态页 `/schedule/` 与 `/docs` |
| `functions/` | Pages Functions：`api/` REST、`mcp/` MCP、`oauth/`、`subscribe/`、`schedule.ics.js` |
| `migrations/` | D1 迁移 `0001` – `0014` |
| `tests/` | Node 回归用例（`*.test.mjs`）与 Playwright 冒烟脚本 |
| `android/` | Android 客户端（Kotlin / Compose） |
| `mac-app/` | macOS 客户端（SwiftUI，只读） |
| `production/` | 进行中的设计草稿与计划，**不入 git** |

## 开发

```bash
npm install
npm run db:local      # 本地 D1 应用迁移
npm run dev           # wrangler pages dev
```

私密配置放本地 `.dev.vars`（`PASSWORD` / `API_TOKEN` / `SESSION_SECRET` / `MCP_WRITE_TOKEN`），
模板见 `.dev.vars.example`，**禁止提交**。

回归测试：

```bash
npm run test:deadlines && npm run test:reminders && npm run test:series-patch && npm run test:tags && npm run test:ics && npm run test:oauth-scopes && npm run test:subjects && npm run test:deadline-course && npm run test:deadline-course-routes
```

部署（需要 Cloudflare 授权，会同时发布前端与 Functions）：

```bash
npm run deploy
```

## 文档

- `PROJECT_SPEC.md` — 需求与架构
- `API_DOC.md` — API 参考
- `production/FRONTEND_SPEC.md` — 前端界面规格
- `BUGS.md` — 已知问题
- `CHANGELOG.md` — 版本变更
- `TEST_CHECKLIST.md` — 测试清单
- `HANDOFF.md` / `MCP_DEPLOY.md` / `DEPLOY_CHECKLIST.md` — 交接与部署
- `updates.md` — AI agent 变更流水

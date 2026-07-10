# AI0506 Calendar — Cloudflare 部署清单 (DEPLOY_CHECKLIST)

> **状态：清单，尚未执行。** 本文档只列出部署 Cloudflare 生产环境所需的步骤，
> **不创建任何生产资源**，等待用户确认后再逐项执行。

## 0. 前置确认

- [ ] 已有 Cloudflare 账号，并已 `wrangler login`（本地测试阶段尚未做，需要浏览器授权）。
- [ ] 域名 `ai0506.com`（或 `calendar.ai0506.com` 子域）DNS 已可由 Cloudflare 管理，或准备接入。
- [ ] 确认预算/额度：D1、Pages Functions 免费额度是否够用（私人单用户日历，预期用量很低）。

## 1. 创建生产 D1 数据库

```powershell
npx wrangler d1 create calendar-db
```

- [ ] 记录输出的 `database_id`，写入 `wrangler.toml` 的 `[[d1_databases]] database_id`（当前为占位 `REPLACE_WITH_DATABASE_ID`）。
- [ ] 确认本地 `wrangler.toml` 改动后提交（该文件不含密钥，可安全提交）。

## 2. 应用数据库迁移到生产

```powershell
npx wrangler d1 migrations apply calendar-db --remote
```

- [ ] 确认 `migrations/0001_init.sql` 在生产库成功执行（events / categories 表 + 索引 + 8 个种子分类）。
- [ ] 用 `wrangler d1 execute calendar-db --remote --command "SELECT count(*) FROM categories;"` 验证种子数据。

## 3. 创建 Cloudflare Pages 项目

- [ ] `npx wrangler pages project create ai0506-calendar`（或通过 Cloudflare Dashboard 创建，关联本 GitHub 仓库 `ai0506/calendar` 实现自动部署）。
- [ ] 确认构建输出目录设置为 `public`（与 `wrangler.toml` 的 `pages_build_output_dir` 一致）。
- [ ] 确认 Functions 目录 `functions/` 会被识别（Pages Functions 基于文件路由，无需额外构建命令）。

## 4. 绑定生产环境变量（密钥）

在 Cloudflare Dashboard → Pages 项目 → Settings → Environment variables（**不写入任何仓库文件**）：

| 变量 | 说明 | 来源 |
|------|------|------|
| `PASSWORD` | 私人登录密码 | 需生成一个新的强密码，**不能复用本地测试值** `test-password` |
| `API_TOKEN` | App / Agent 访问令牌 | 需生成新的长随机字符串，**不能复用本地测试值** `local-test-token-123` |
| `SESSION_SECRET` | Cookie HMAC 签名密钥 | 需生成新的长随机字符串，**不能复用本地测试值** |

- [ ] 三个变量均在生产环境单独设置（区分 Production / Preview 环境，视需要决定是否共用）。
- [ ] 确认 `.dev.vars`（含本地测试值）**未被** `wrangler pages deploy` 一并上传（Pages 部署本身不会打包 `.dev.vars`，且其已被 `.gitignore` 排除，仓库里不存在该文件）。

## 5. 绑定生产 D1 到 Pages 项目

- [ ] 确认 `wrangler.toml` 中的 `[[d1_databases]]` 绑定（`binding = "DB"`）会被 Pages 部署自动识别；如通过 Dashboard 创建项目，需要在 Settings → Functions → D1 database bindings 手动关联 `calendar-db`。

## 6. 域名与 HTTPS

- [ ] 在 Pages 项目 Custom domains 中添加 `calendar.ai0506.com`。
- [ ] 确认 DNS CNAME/记录指向 Cloudflare Pages（若域名已在 Cloudflare 管理，通常一键添加即可）。
- [ ] 确认 HTTPS 自动签发（Cloudflare 默认提供），因为登录 Cookie 使用 `Secure` 标志，**生产环境必须是 HTTPS**，否则浏览器不会保存 Cookie。

## 7. 部署

```powershell
npx wrangler pages deploy public
```

（或依赖第 3 步中配置的 GitHub 集成，推送到 `main` 分支自动触发部署。）

- [ ] 部署完成后确认 Functions 已生效（访问 `/api/auth/status` 应返回 `{authenticated:false}` 而非 404/500）。

## 8. 生产冒烟测试（部署后，对照 TEST_CHECKLIST.md）

- [ ] `GET /api/events` 无凭证 → 401
- [ ] `POST /api/auth/login`（生产密码）→ 200 + Set-Cookie（`Secure`，需 HTTPS 才会被保存）
- [ ] Bearer Token 访问 events API 正常
- [ ] 创建 / 查询 / 更新 / 软删除一个测试事件，确认后手动清理（或保留作为真实数据）
- [ ] `GET /api/categories` 返回 8 个种子分类
- [ ] `GET /api/export?format=json|csv|md` 均正常

## 9. 收尾

- [ ] 确认 `wrangler.toml` 中真实 `database_id` 已提交到仓库（不敏感，D1 ID 本身不是密钥）。
- [ ] 确认 `CHANGELOG.md` 记录首次生产部署。
- [ ] 确认 `updates.md` 记录部署时间与结果。

---

## 需要用户提供 / 决定的事项

1. 确认使用哪个 Cloudflare 账号部署。
2. 确认生产 `PASSWORD` / `API_TOKEN` / `SESSION_SECRET` 的生成方式（建议由用户自行生成强随机值，不经过 AI 传输）。
3. 确认域名 `calendar.ai0506.com` 是否已可用/DNS 是否已托管在 Cloudflare。
4. 确认是否通过 Dashboard 的 GitHub 集成自动部署，还是手动 `wrangler pages deploy`。

**本清单未执行任何命令，未创建任何生产资源。等待用户确认后再开始部署。**

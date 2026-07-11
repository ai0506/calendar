# MCP Custom Connector — 部署与接入说明

把本项目作为 **Claude / ChatGPT 自定义连接器（Remote MCP + OAuth 2.1）** 上线。
最终目标：在 Claude → Settings → Connectors → Add custom connector 填入
`https://calendar.ai0506.com/mcp`，授权后 Claude 可读取 / 创建 / 修改 / 删除日历事件。

---

## 1. 本次新增/改动的文件

| 文件 | 作用 |
|------|------|
| `functions/mcp/index.js` | MCP 端点（Streamable HTTP）。要求有效 Bearer access token，暴露 5 个工具 |
| `functions/_lib/oauth.js` | OAuth 辅助：PKCE、无状态 access token 签名/校验、随机令牌、资源标识 |
| `functions/.well-known/oauth-protected-resource.js` | 受保护资源元数据 (RFC 9728) |
| `functions/.well-known/oauth-authorization-server.js` | 授权服务器元数据 (RFC 8414) |
| `functions/oauth/register.js` | 动态客户端注册 DCR (RFC 7591) |
| `functions/oauth/authorize.js` | 授权端点（登录页 + 签发授权码） |
| `functions/oauth/token.js` | 令牌端点（authorization_code / refresh_token） |
| `migrations/0006_oauth.sql` | oauth_clients / oauth_codes / oauth_refresh_tokens 三张表 |
| `.dev.vars` / `.dev.vars.example` | 新增 `MCP_WRITE_TOKEN`（仅本地调试） |

**未改动**：现有 REST API（`functions/api/*`）、`_middleware.js`、`_lib` 其余文件、API_TOKEN、Cookie 登录。

---

## 2. 认证模型（简述）

- `/mcp` 每个请求都需 `Authorization: Bearer <access_token>`；无/无效 token → 401 + `WWW-Authenticate`，触发 Claude 走 OAuth。
- access token：无状态签名（HMAC，密钥复用 `SESSION_SECRET`），含 `aud`（= `https://calendar.ai0506.com/mcp`）、1 小时过期；`/mcp` 校验签名 + 过期 + aud。
- 授权码：入库、5 分钟过期、单次使用（原子置位防重放）、绑定 client + redirect_uri + PKCE(S256) + resource。
- refresh token：入库存哈希、30 天、轮换（用一次即失效）。
- 授权页复用**本人登录密码**（`PASSWORD`）作为同意凭据 —— 密码本身不会成为 access token。

---

## 3. 环境变量

生产环境（Cloudflare Pages → 项目 → Settings → Environment variables）需要：

| 变量 | 说明 |
|------|------|
| `PASSWORD` | 你的登录密码（已存在，授权页会用它校验） |
| `SESSION_SECRET` | HMAC 密钥（已存在，现在也用于签 access token）。**要足够长的随机串** |
| `API_TOKEN` | 现有 REST/Agent token（保持不变） |
| `MCP_WRITE_TOKEN` | ⚠️ **生产不要设置**。它是本地调试旁路；线上只应通过 OAuth 访问 |

> 若你曾在生产设过 `MCP_WRITE_TOKEN`，上线前请删除它。

本地开发：`.dev.vars` 已含 `MCP_WRITE_TOKEN="local-mcp-write-token-abc"`，仅本机使用。

---

## 4. 部署步骤

### 4.1 应用数据库迁移（远程 D1）—— ⏸ 需要你执行

```bash
npm run db:remote
# 等价于 wrangler d1 migrations apply calendar-db --remote
```

这会在生产 D1 应用 `0006_oauth.sql`。执行前请确认你已 `wrangler login` 且能访问该数据库。

### 4.2 部署代码

```bash
npm run deploy
# 等价于 wrangler pages deploy
```

### 4.3 部署后自检（把域名换成你的）

```bash
# 授权服务器元数据
curl -s https://calendar.ai0506.com/.well-known/oauth-authorization-server | jq
# 受保护资源元数据
curl -s https://calendar.ai0506.com/.well-known/oauth-protected-resource | jq
# /mcp 无 token 应 401 且带 WWW-Authenticate
curl -s -i -X POST https://calendar.ai0506.com/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}' | grep -i "HTTP/\|WWW-Authenticate"
```

`issuer` / `authorization_endpoint` 等应显示为你的正式域名；`/mcp` 应返回 `401` 且带
`WWW-Authenticate: Bearer resource_metadata="https://calendar.ai0506.com/.well-known/oauth-protected-resource"`。

> 若 `/.well-known/...` 返回 404：确认 `functions/.well-known/` 目录随部署上传成功
> （本地 dev 已验证该点开头目录可正常路由）。

---

## 5. 在 Claude 网页端连接 —— ⏸ 需要你操作

1. Claude → **Settings → Connectors → Add custom connector**。
2. **Name**：随意，如 `AI0506 Calendar`。
3. **Remote MCP server URL**：`https://calendar.ai0506.com/mcp`。
4. **OAuth Client ID / Secret**：**留空**（服务器支持动态注册 DCR，Claude 会自动注册）。
5. 点 **Add** → Claude 会跳转到你的授权页 → **输入你的登录密码** → 授权。
6. 成功后即可对 Claude 说：“看看我这周的日程”“周四晚上加一节物理复习”。

---

## 6. 本地联调（可选，用 MCP Inspector）

```bash
# 终端 A：起本地服务
npx wrangler pages dev public --port 8788 --local
# 终端 B：起 Inspector
npx @modelcontextprotocol/inspector
```

- Inspector 里 Transport 选 `Streamable HTTP`，URL `http://127.0.0.1:8788/mcp`。
- 本地可用 `MCP_WRITE_TOKEN`（`local-mcp-write-token-abc`）作为 Bearer 直接连接，
  跳过完整 OAuth 走查工具；
- 或用真实 OAuth 流程（Inspector 的 OAuth 选项，会自动发现 `.well-known` 元数据）。

---

## 7. 需要你手动处理的清单（汇总）

- [ ] `npm run db:remote`：远程应用 0006 迁移
- [ ] 确认生产环境变量 `SESSION_SECRET` 为足够长的随机串
- [ ] 确认生产**未设置** `MCP_WRITE_TOKEN`
- [ ] `npm run deploy`：部署
- [ ] 跑第 4.3 节自检
- [ ] 在 Claude Settings → Connectors 里添加并授权

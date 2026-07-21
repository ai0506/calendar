# MCP Custom Connector — 部署与接入说明

把本项目作为 **Claude / ChatGPT 自定义连接器（Remote MCP + OAuth 2.1）** 上线。
最终目标：在 Claude → Settings → Connectors → Add custom connector 填入
`https://calendar.ai0506.com/mcp`，授权后 Claude 可读取 / 创建 / 修改 / 删除日历事件。

---

## 1. 本次新增/改动的文件

| 文件 | 作用 |
|------|------|
| `functions/mcp/index.js` | MCP 端点（Streamable HTTP）。要求有效 Bearer access token，暴露事件、重复系列和单次 Deadline 工具 |
| `functions/_lib/oauth.js` | OAuth 辅助：PKCE、无状态 access token 签名/校验、随机令牌、资源标识 |
| `functions/.well-known/oauth-protected-resource.js` | 受保护资源元数据 (RFC 9728) |
| `functions/.well-known/oauth-authorization-server.js` | 授权服务器元数据 (RFC 8414) |
| `functions/oauth/register.js` | 动态客户端注册 DCR (RFC 7591) |
| `functions/oauth/authorize.js` | 授权端点（登录页 + 签发授权码） |
| `functions/oauth/token.js` | 令牌端点（authorization_code / refresh_token） |
| `migrations/0006_oauth.sql` | oauth_clients / oauth_codes / oauth_refresh_tokens 三张表 |
| `.dev.vars` / `.dev.vars.example` | 新增 `MCP_WRITE_TOKEN`（仅本地调试） |

**未改动**：现有 REST API（`functions/api/*`）、`_middleware.js`、`_lib` 其余文件、API_TOKEN、Cookie 登录。

Deadline MCP 使用与 REST API 相同的 D1 表和 `functions/_lib/deadlines.js` 校验逻辑；支持单次 Deadline，暂不支持重复 Deadline。

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

## 7. Deadline 工具

- `calendar_list_deadlines`：按 `from` / `to`（`YYYY-MM-DD`）、分类和完成状态查询；不传日期默认返回未来 30 天。
- `calendar_create_deadline`：创建单次 DDL，必须提供 `title`、`due_time`；`priority` 为 `high`、`default` 或 `low`。
- `calendar_get_deadline`、`calendar_update_deadline`、`calendar_delete_deadline`：读取、修改和软删除 DDL。
- `calendar_complete_deadline` / `calendar_reopen_deadline`：完成或重新打开 DDL，重复调用幂等。

DDL 使用独立的 `due_time`、`priority` 和完成状态，不要当作普通 event 创建。

---

## 8. 需要你手动处理的清单（汇总）

- [ ] `npm run db:remote`：远程应用 0006 迁移
- [ ] 确认生产环境变量 `SESSION_SECRET` 为足够长的随机串
- [ ] 确认生产**未设置** `MCP_WRITE_TOKEN`
- [ ] `npm run deploy`：部署
- [ ] 跑第 4.3 节自检
- [ ] 在 Claude Settings → Connectors 里添加并授权

---

## 8. 给 AI 的工具使用约定

这个 MCP 对应用户的**主日历**。除非用户明确指定其他日历，否则 AI 应将这里作为默认日历，直接读取和写入。

### 工具命名

所有工具名都带 `calendar_` 前缀（如 `calendar_list_events`），用于和同时挂载的其他 MCP server（Cloudflare 等）区分。
不带前缀的旧工具名仍被服务端接受并透明映射到新名，但 `tools/list` 只返回新名，新接入请一律使用带前缀的名字。

### 查询事件

- 调用工具前先读取 `tools/list`，不要猜工具名或参数名。
- `calendar_list_events` 不传 `from` / `to` 时，默认只返回当前 `Asia/Shanghai` 时间起未来 30 天的事件。
- 查询历史或 30 天以外的事件时，必须显式传入 `from` / `to`，格式为带时区的 ISO 8601，例如 `2026-07-14T00:00:00+08:00`。
- 只传 `from` 或只传 `to` 时，另一侧不自动补范围，适合查询“某日期之后”或“某日期之前”。

### 普通事件

- 创建事件至少需要 `title` 和 `start_time`。
- `start_time` / `end_time` 使用 ISO 8601；全天事件可以使用 `YYYY-MM-DD`，并设置 `all_day=true`。
- `end_time` 必须晚于 `start_time`。
- 不确定颜色时使用 `color="default"`，让系统跟随分类颜色。

### 重复系列

- `calendar_create_event_series` 必须指定 `end_date` 或 `occurrence_count`，不能创建无限重复系列。
- `weekly` 必须提供 `weekdays`：周日为 `0`，周一为 `1`，一直到周六 `6`。
- `calendar_split_series`、`calendar_skip_occurrence`、`calendar_restore_occurrence` 使用 `series_id`。
- `calendar_get_event_series`、`calendar_update_event_series`、`calendar_delete_event_series` 也优先使用 `series_id`；旧版 `id` 仍兼容，但不要两个字段同时传。
- 始终使用 `calendar_create_event_series` 或 `calendar_split_series` 返回的精确 ID，不要根据标题、事件 ID 或日期猜系列 ID。

### 删除和修改

- 只取消重复系列中的一次，使用 `calendar_skip_occurrence`；不要删除整个系列。
- 需要从某天起改变规则时，先 `calendar_split_series`，再对返回的 `new_series_id` 使用 `calendar_update_event_series`。
- `calendar_update_event_series` 会重新生成整个系列实例，可能覆盖之前对单个实例做过的修改；只有确认影响范围后才使用。
- `calendar_delete_event_series` 是破坏性操作。调用前应确认目标 `series_id`，并在结果异常时先用 `calendar_get_event_series` 或 `calendar_list_events` 核对，不要立即重复删除。

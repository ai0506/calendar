-- AI0506 Calendar — Migration 0006: OAuth 2.1 (MCP Custom Connector)
--
-- 为 MCP 端点提供 OAuth 2.1 + PKCE 授权。仅服务本人（单用户）。
-- access_token 采用无状态签名令牌（HMAC(SESSION_SECRET)），不入库；
-- 授权码与刷新令牌入库，以支持“单次使用 / 过期 / 轮换 / 撤销”。
--
-- 说明：
--   * expires_at 为 unix 秒（INTEGER）。
--   * oauth_codes.used：0 未用 / 1 已用；换取 token 时原子置 1 防重放。
--   * oauth_refresh_tokens.token_hash 存 SHA-256 十六进制，不存明文令牌。

-- 动态注册的客户端（Claude 等 MCP 客户端通过 DCR 注册）
CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id                   TEXT PRIMARY KEY,
  client_name                 TEXT,
  redirect_uris               TEXT NOT NULL,               -- JSON 数组字符串
  token_endpoint_auth_method  TEXT NOT NULL DEFAULT 'none',
  grant_types                 TEXT,                        -- JSON 数组字符串
  response_types              TEXT,                        -- JSON 数组字符串
  scope                       TEXT,
  created_at                  TEXT NOT NULL
);

-- 授权码（短期、单次使用）
CREATE TABLE IF NOT EXISTS oauth_codes (
  code                    TEXT PRIMARY KEY,
  client_id               TEXT NOT NULL,
  redirect_uri            TEXT NOT NULL,
  code_challenge          TEXT NOT NULL,
  code_challenge_method   TEXT NOT NULL,
  resource                TEXT,
  scope                   TEXT,
  user_sub                TEXT NOT NULL,
  expires_at              INTEGER NOT NULL,
  used                    INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires_at ON oauth_codes (expires_at);

-- 刷新令牌（长期、轮换、可撤销；存哈希）
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token_hash    TEXT PRIMARY KEY,
  client_id     TEXT NOT NULL,
  resource      TEXT,
  scope         TEXT,
  user_sub      TEXT NOT NULL,
  expires_at    INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_expires_at ON oauth_refresh_tokens (expires_at);

-- AI0506 Calendar — Migration 0001: 初始化 schema
-- Cloudflare D1 (SQLite)
--
-- 说明：
--   * 时间字段统一使用 ISO 8601 带时区偏移 的字符串，例如 2026-07-14T19:00:00+08:00
--     按客户端提交的偏移原样存储，不强制转 UTC。
--   * 软删除：events.deleted_at 为 NULL 表示未删除。
--   * 本迁移只建结构化数据表；未来的 settings / day_marks 暂不创建。

-- ---------------------------------------------------------------------------
-- events：日历事件
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id           TEXT PRIMARY KEY,              -- UUID，由服务器生成
  title        TEXT NOT NULL,                 -- 标题
  description  TEXT,                          -- 描述
  start_time   TEXT NOT NULL,                 -- 开始时间 (ISO 8601 带时区偏移)
  end_time     TEXT,                          -- 结束时间 (ISO 8601 带时区偏移)
  all_day      INTEGER NOT NULL DEFAULT 0,    -- 全天事件标记 0/1
  category     TEXT,                          -- 分类名称 (对应 categories.name)
  color        TEXT,                          -- 颜色 (覆盖分类默认色，可选)
  group_title  TEXT,                          -- 分组标题 (未来合并显示课程用)
  source       TEXT NOT NULL DEFAULT 'web',   -- 来源: web / agent / import ...
  external_id  TEXT,                          -- 外部唯一标识，用于导入去重
  created_at   TEXT NOT NULL,                 -- 创建时间 (ISO 8601 带时区偏移)
  updated_at   TEXT NOT NULL,                 -- 更新时间 (ISO 8601 带时区偏移)
  deleted_at   TEXT                           -- 软删除时间戳，NULL = 未删除
);

-- 日历视图范围查询：按开始时间过滤
CREATE INDEX IF NOT EXISTS idx_events_start_time ON events (start_time);

-- 常用列表查询：排除软删除
CREATE INDEX IF NOT EXISTS idx_events_deleted_at ON events (deleted_at);

-- 按分类过滤
CREATE INDEX IF NOT EXISTS idx_events_category ON events (category);

-- 幂等导入：同一 source 下 external_id 唯一（external_id 非空时才约束）
-- 防止 AI Agent / 导入工具重复创建。
CREATE UNIQUE INDEX IF NOT EXISTS uniq_events_source_external
  ON events (source, external_id)
  WHERE external_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- categories：事件分类（保持简单，方便以后扩展）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,               -- UUID
  name        TEXT NOT NULL UNIQUE,           -- 分类名
  color       TEXT NOT NULL,                  -- 颜色
  sort_order  INTEGER NOT NULL DEFAULT 0,     -- 排序
  created_at  TEXT NOT NULL                   -- 创建时间 (ISO 8601 带时区偏移)
);

-- ---------------------------------------------------------------------------
-- 默认分类种子数据（来自 PROJECT_SPEC）
-- 颜色为初始建议值，可后续调整。
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO categories (id, name, color, sort_order, created_at) VALUES
  ('cat-math',     'Math',             '#dc2626', 1, '2026-07-10T00:00:00+08:00'),
  ('cat-physics',  'Physics',          '#0891b2', 2, '2026-07-10T00:00:00+08:00'),
  ('cat-cs',       'CS',               '#16a34a', 3, '2026-07-10T00:00:00+08:00'),
  ('cat-school',   'Other Subjects',   '#2563eb', 4, '2026-07-10T00:00:00+08:00'),
  ('cat-research', 'Research',         '#7c3aed', 5, '2026-07-10T00:00:00+08:00'),
  ('cat-project',  'Projects',         '#ea580c', 6, '2026-07-10T00:00:00+08:00'),
  ('cat-personal', 'Leisure',          '#db2777', 7, '2026-07-10T00:00:00+08:00'),
  ('cat-other',    'Tech',             '#64748b', 8, '2026-07-10T00:00:00+08:00');

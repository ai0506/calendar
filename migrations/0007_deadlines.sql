-- AI0506 Calendar - Migration 0007: single deadlines
--
-- A deadline is a due point with completion state, not an events time span.
-- due_time stores either YYYY-MM-DD for all-day deadlines or an ISO 8601
-- datetime with timezone offset for precise deadlines.

CREATE TABLE IF NOT EXISTS deadlines (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT,
  due_time      TEXT NOT NULL,
  all_day       INTEGER NOT NULL DEFAULT 0,
  category      TEXT,
  color         TEXT,
  group_title   TEXT,
  source        TEXT NOT NULL DEFAULT 'web',
  external_id   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  completed_at  TEXT,
  deleted_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_deadlines_due_time
  ON deadlines (due_time);

CREATE INDEX IF NOT EXISTS idx_deadlines_due_date
  ON deadlines (substr(due_time, 1, 10), deleted_at, category);

CREATE INDEX IF NOT EXISTS idx_deadlines_deleted_at
  ON deadlines (deleted_at);

CREATE INDEX IF NOT EXISTS idx_deadlines_category
  ON deadlines (category);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_deadlines_source_external
  ON deadlines (source, external_id)
  WHERE external_id IS NOT NULL;

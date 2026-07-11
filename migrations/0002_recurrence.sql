-- AI0506 Calendar — Migration 0002: recurring event series
--
-- recurrence_index and original_start_time are reserved for future exception
-- editing. v1 stores them but does not read them for queries, deletion, or
-- recalculation.

ALTER TABLE events ADD COLUMN series_id TEXT;
ALTER TABLE events ADD COLUMN recurrence_index INTEGER;
ALTER TABLE events ADD COLUMN original_start_time TEXT;

CREATE INDEX IF NOT EXISTS idx_events_series_id ON events (series_id);

CREATE TABLE IF NOT EXISTS event_series (
  id                TEXT PRIMARY KEY,
  idempotency_key   TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  description       TEXT,
  category          TEXT,
  color             TEXT,
  group_title       TEXT,
  all_day           INTEGER NOT NULL DEFAULT 0,
  start_time        TEXT NOT NULL,
  end_time          TEXT,
  frequency         TEXT NOT NULL,
  interval          INTEGER NOT NULL DEFAULT 1,
  weekdays          TEXT,
  monthly_mode      TEXT,
  monthly_day       INTEGER,
  start_date        TEXT NOT NULL,
  end_date          TEXT,
  occurrence_count  INTEGER,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_series_deleted_at ON event_series (deleted_at);
CREATE INDEX IF NOT EXISTS idx_event_series_start_date ON event_series (start_date);

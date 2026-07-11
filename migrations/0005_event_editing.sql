-- AI0506 Calendar — Migration 0005: event exceptions and mutation idempotency

CREATE TABLE IF NOT EXISTS event_exceptions (
  id                   TEXT PRIMARY KEY,
  series_id            TEXT NOT NULL,
  original_start_time  TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  UNIQUE (series_id, original_start_time)
);

CREATE INDEX IF NOT EXISTS idx_event_exceptions_series_id
  ON event_exceptions (series_id);

CREATE TABLE IF NOT EXISTS event_operations (
  idempotency_key   TEXT PRIMARY KEY,
  operation_type    TEXT NOT NULL,
  source_series_id  TEXT NOT NULL,
  result_series_id  TEXT,
  request_hash      TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_operations_source_series_id
  ON event_operations (source_series_id);

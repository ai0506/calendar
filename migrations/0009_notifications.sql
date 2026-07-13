-- AI0506 Calendar - Migration 0009: notification plans, configuration and inbox

CREATE TABLE IF NOT EXISTS event_reminder_configs (
  event_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('custom', 'disabled')),
  reminders_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_series_reminder_configs (
  series_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('custom', 'disabled')),
  reminders_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL CHECK (target_type IN ('event', 'deadline')),
  target_id TEXT NOT NULL,
  reminder_key TEXT NOT NULL,
  minutes_before INTEGER,
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'cancelled', 'skipped')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  cancelled_at TEXT
);

-- Historical cancelled/sent/skipped rows are retained.  Only active plans must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS reminders_pending_target_key
  ON reminders(target_type, target_id, reminder_key)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_reminders_status_scheduled
  ON reminders(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_reminders_target_status
  ON reminders(target_type, target_id, status);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE(reminder_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read_created ON notifications(read_at, created_at DESC);

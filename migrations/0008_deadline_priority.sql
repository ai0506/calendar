-- AI0506 Calendar - Migration 0008: deadline priority
-- Priority describes importance only; it does not change deadline status or due-time semantics.

ALTER TABLE deadlines
  ADD COLUMN priority TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_deadlines_priority
  ON deadlines (priority);

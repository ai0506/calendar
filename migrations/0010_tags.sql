-- AI0506 Calendar — Migration 0010: global tags and tag suggestions

CREATE TABLE IF NOT EXISTS tags (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  color       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_tags (
  event_id    TEXT NOT NULL,
  tag_id      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (event_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_event_tags_tag_id ON event_tags (tag_id);

CREATE TABLE IF NOT EXISTS deadline_tags (
  deadline_id TEXT NOT NULL,
  tag_id      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (deadline_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_deadline_tags_tag_id ON deadline_tags (tag_id);

CREATE TABLE IF NOT EXISTS event_series_tags (
  series_id   TEXT NOT NULL,
  tag_id      TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (series_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_event_series_tags_tag_id ON event_series_tags (tag_id);

CREATE TABLE IF NOT EXISTS category_tag_suggestions (
  category_id TEXT NOT NULL,
  tag_id      TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (category_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_category_tag_suggestions_tag_id
  ON category_tag_suggestions (tag_id);

INSERT OR IGNORE INTO tags (id, name, color, sort_order, created_at) VALUES
  ('tag-exam', 'Exam', NULL, 1, '2026-07-17T00:00:00+08:00'),
  ('tag-homework', 'Homework', NULL, 2, '2026-07-17T00:00:00+08:00'),
  ('tag-assignment', 'Assignment', NULL, 3, '2026-07-17T00:00:00+08:00'),
  ('tag-revision', 'Revision', NULL, 4, '2026-07-17T00:00:00+08:00'),
  ('tag-lecture', 'Lecture', NULL, 5, '2026-07-17T00:00:00+08:00'),
  ('tag-lab', 'Lab', NULL, 6, '2026-07-17T00:00:00+08:00'),
  ('tag-paper', 'Paper', NULL, 7, '2026-07-17T00:00:00+08:00'),
  ('tag-reading', 'Reading', NULL, 8, '2026-07-17T00:00:00+08:00'),
  ('tag-experiment', 'Experiment', NULL, 9, '2026-07-17T00:00:00+08:00'),
  ('tag-meeting', 'Meeting', NULL, 10, '2026-07-17T00:00:00+08:00'),
  ('tag-development', 'Development', NULL, 11, '2026-07-17T00:00:00+08:00'),
  ('tag-bug', 'Bug', NULL, 12, '2026-07-17T00:00:00+08:00'),
  ('tag-release', 'Release', NULL, 13, '2026-07-17T00:00:00+08:00'),
  ('tag-planning', 'Planning', NULL, 14, '2026-07-17T00:00:00+08:00'),
  ('tag-subscription', 'Subscription', NULL, 15, '2026-07-17T00:00:00+08:00'),
  ('tag-renewal', 'Renewal', NULL, 16, '2026-07-17T00:00:00+08:00'),
  ('tag-account', 'Account', NULL, 17, '2026-07-17T00:00:00+08:00');

INSERT OR IGNORE INTO category_tag_suggestions (category_id, tag_id, sort_order) VALUES
  ('cat-math', 'tag-exam', 1), ('cat-math', 'tag-homework', 2), ('cat-math', 'tag-assignment', 3), ('cat-math', 'tag-revision', 4), ('cat-math', 'tag-lecture', 5),
  ('cat-physics', 'tag-exam', 1), ('cat-physics', 'tag-homework', 2), ('cat-physics', 'tag-assignment', 3), ('cat-physics', 'tag-revision', 4), ('cat-physics', 'tag-lecture', 5), ('cat-physics', 'tag-lab', 6),
  ('cat-cs', 'tag-exam', 1), ('cat-cs', 'tag-homework', 2), ('cat-cs', 'tag-assignment', 3), ('cat-cs', 'tag-revision', 4), ('cat-cs', 'tag-lecture', 5),
  ('cat-school', 'tag-exam', 1), ('cat-school', 'tag-homework', 2), ('cat-school', 'tag-assignment', 3), ('cat-school', 'tag-revision', 4), ('cat-school', 'tag-lecture', 5),
  ('cat-research', 'tag-paper', 1), ('cat-research', 'tag-reading', 2), ('cat-research', 'tag-experiment', 3), ('cat-research', 'tag-meeting', 4),
  ('cat-project', 'tag-development', 1), ('cat-project', 'tag-bug', 2), ('cat-project', 'tag-release', 3), ('cat-project', 'tag-planning', 4),
  ('cat-other', 'tag-subscription', 1), ('cat-other', 'tag-renewal', 2), ('cat-other', 'tag-account', 3);

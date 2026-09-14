-- Calendar — Migration 0013: independent course schedule layer
-- Courses are projections in the calendar UI. They are not events, deadlines,
-- reminders, or recurring event series.

CREATE TABLE IF NOT EXISTS terms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  time_zone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  term_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  name TEXT NOT NULL,
  teacher TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (term_id) REFERENCES terms(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

CREATE INDEX IF NOT EXISTS idx_courses_term ON courses(term_id, active);
CREATE INDEX IF NOT EXISTS idx_courses_subject ON courses(subject_id);

CREATE TABLE IF NOT EXISTS course_slots (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  room TEXT,
  first_week INTEGER,
  last_week INTEGER,
  week_pattern TEXT NOT NULL DEFAULT 'all' CHECK (week_pattern IN ('all', 'odd', 'even')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (course_id) REFERENCES courses(id)
);

CREATE INDEX IF NOT EXISTS idx_course_slots_lookup
  ON course_slots(course_id, weekday, start_time);

CREATE TABLE IF NOT EXISTS course_overrides (
  id TEXT PRIMARY KEY,
  term_id TEXT NOT NULL,
  effective_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('cancel', 'cancel_day', 'makeup', 'move', 'add')),
  course_slot_id TEXT,
  course_id TEXT,
  replacement_date TEXT,
  start_time TEXT,
  end_time TEXT,
  room TEXT,
  title TEXT,
  teacher TEXT,
  subject_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (term_id) REFERENCES terms(id),
  FOREIGN KEY (course_slot_id) REFERENCES course_slots(id),
  FOREIGN KEY (course_id) REFERENCES courses(id),
  FOREIGN KEY (subject_id) REFERENCES subjects(id)
);

CREATE INDEX IF NOT EXISTS idx_course_overrides_date
  ON course_overrides(term_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_course_overrides_slot_date
  ON course_overrides(course_slot_id, effective_date);

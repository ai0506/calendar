-- Calendar — Migration 0015: optional Deadline -> Course context
--
-- This is a historical association only. A Course never becomes a Deadline,
-- and inactive Courses remain valid association targets when Subject/category
-- validation succeeds in the application layer.

ALTER TABLE deadlines ADD COLUMN course_id TEXT REFERENCES courses(id);

CREATE INDEX IF NOT EXISTS idx_deadlines_course_id
  ON deadlines(course_id);

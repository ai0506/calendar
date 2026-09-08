-- AI0506 Calendar — Migration 0012: Academics 特殊分类与 Subject 子类
--
-- 背景：项目最初把 Math / Physics / CS / Other Subjects 这些「学科」直接当作
-- Category 使用，导致 Category 同时承担了「日程组织范围」和「学业科目」两个语义。
-- 本迁移把四个学科 Category 合并成一个特殊 Category `Academics`，学科下沉为
-- 它专属的子类 `subjects`。
--
-- 迁移原则（见 production/COURSE_SCHEDULE_PLAN.md）：
--   * 不删除旧 Category，只标记 archived —— 已被 Apple 日历订阅的分类 ICS feed
--     依赖 categories.id，删除会让订阅 404。
--   * events / deadlines / event_series 的 category 字段仍存「分类名文本」，
--     本阶段只新增 subject_id，不改成 category_id。
--   * 迁移前把「写入时快照的分类色」归一化成 NULL（跟随分类/科目色），
--     否则旧数据会被永久钉死在旧颜色上，改科目颜色不生效。
--     生产库盘点确认：所有非空 color 都精确等于其分类色，无用户自定义色，
--     因此本次归一化无损。原值仍写入备份表以便回滚。
--   * 回滚脚本见 migrations/README_rollback_0012.md。

-- ---------------------------------------------------------------------------
-- 1. categories 扩展：kind 区分特殊分类，archived 保留历史分类但不再列出
-- ---------------------------------------------------------------------------
ALTER TABLE categories ADD COLUMN kind TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE categories ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. subjects：Academics 专属子类
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subjects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL COLLATE NOCASE UNIQUE,
  category_id TEXT NOT NULL,               -- 目前恒为 cat-academics
  color       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,  -- 停用的科目不再出现在选择器，但旧数据仍可读
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subjects_category ON subjects (category_id);

-- ---------------------------------------------------------------------------
-- 3. 三张主表新增 subject_id（仅当 category = 'Academics' 时允许非空）
-- ---------------------------------------------------------------------------
ALTER TABLE events ADD COLUMN subject_id TEXT;
ALTER TABLE deadlines ADD COLUMN subject_id TEXT;
ALTER TABLE event_series ADD COLUMN subject_id TEXT;

CREATE INDEX IF NOT EXISTS idx_events_subject_id ON events (subject_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_subject_id ON deadlines (subject_id);
CREATE INDEX IF NOT EXISTS idx_event_series_subject_id ON event_series (subject_id);

-- ---------------------------------------------------------------------------
-- 4. 迁移前备份 category / color 原值（含软删除行，便于整体回滚）
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS migration_0012_backup (
  table_name   TEXT NOT NULL,
  row_id       TEXT NOT NULL,
  old_category TEXT,
  old_color    TEXT,
  PRIMARY KEY (table_name, row_id)
);

INSERT OR IGNORE INTO migration_0012_backup (table_name, row_id, old_category, old_color)
  SELECT 'events', id, category, color FROM events;
INSERT OR IGNORE INTO migration_0012_backup (table_name, row_id, old_category, old_color)
  SELECT 'deadlines', id, category, color FROM deadlines;
INSERT OR IGNORE INTO migration_0012_backup (table_name, row_id, old_category, old_color)
  SELECT 'event_series', id, category, color FROM event_series;

-- ---------------------------------------------------------------------------
-- 5. 颜色归一化：快照色与字面量 "default" 一律回落成 NULL = 跟随分类/科目色
-- ---------------------------------------------------------------------------
UPDATE events SET color = NULL
  WHERE color IS NOT NULL
    AND (lower(color) = 'default'
         OR color = (SELECT c.color FROM categories c WHERE c.name = events.category));

UPDATE deadlines SET color = NULL
  WHERE color IS NOT NULL
    AND (lower(color) = 'default'
         OR color = (SELECT c.color FROM categories c WHERE c.name = deadlines.category));

UPDATE event_series SET color = NULL
  WHERE color IS NOT NULL
    AND (lower(color) = 'default'
         OR color = (SELECT c.color FROM categories c WHERE c.name = event_series.category));

-- ---------------------------------------------------------------------------
-- 6. 两级配色：普通 Category 退到背景，Subject 跳出来
--
--    分类降饱和（不提高明度 —— 事项文字色是 inkColor = 74% 色 + 26% 主文字色
--    算出来的，把颜色调浅会让浅色主题下的标签对比度掉到 3 左右）；
--    科目改用 Apple 系统色板，与 /schedule 课表页的配色同源。
--
--    已知取舍：Apple 的亮色在浅色主题下文字对比度偏低（English 3.1、CS 3.7、
--    Physics 3.6，低于本项目既有的 4.2 下限），这是「轻」的观感的直接代价，
--    由用户在配色评审后明确选定。若日后觉得吃力，把 English 换成 #d17f00、
--    Physics 换成 #1a9ad5、CS 换成 #2ca84e 即可全部提到 4.2 以上。
--
--    Academics 例外：它不是并列的一个普通分类，而是科目的父级，取深中性色，
--    与「淡」的普通分类和「艳」的科目都能区分。它只在「学业但未指定科目」时出现。
--
--    注意顺序：本段必须在第 5 步颜色归一化之后执行 —— 归一化要拿旧的分类颜色
--    去比对历史 color 快照，先改颜色会让那些快照识别不出来、被当成自定义色留下。
-- ---------------------------------------------------------------------------
-- 分类只降一半饱和：仍然认得出原来的紫 / 橙 / 粉，四色之间的 CIELAB 最小色差
-- 保持在 38.9（低于 25 就会糊成一片灰，这是前几版被否掉的原因）。
-- Tech 本来就是低饱和的灰蓝，无需再降，保持原值。
UPDATE categories SET color = '#7f5fb5' WHERE id = 'cat-research';   -- 旧 #7c3aed
UPDATE categories SET color = '#c07043' WHERE id = 'cat-project';    -- 旧 #ea580c
UPDATE categories SET color = '#bd5f86' WHERE id = 'cat-personal';   -- 旧 #db2777
-- cat-other (Tech) 保持 #64748b 不变

INSERT OR IGNORE INTO categories (id, name, color, sort_order, created_at, kind, archived) VALUES
  ('cat-academics', 'Academics', '#655f58', 1, '2026-09-04T00:00:00+08:00', 'academics', 0);

INSERT OR IGNORE INTO subjects (id, name, category_id, color, sort_order, active, created_at, updated_at) VALUES
  ('sub-math',    'Math',           'cat-academics', '#ff3b30', 1, 1, '2026-09-04T00:00:00+08:00', '2026-09-04T00:00:00+08:00'),
  ('sub-physics', 'Physics',        'cat-academics', '#32ade6', 2, 1, '2026-09-04T00:00:00+08:00', '2026-09-04T00:00:00+08:00'),
  ('sub-cs',      'CS',             'cat-academics', '#30b855', 3, 1, '2026-09-04T00:00:00+08:00', '2026-09-04T00:00:00+08:00'),
  ('sub-english', 'English',        'cat-academics', '#ff9f0a', 4, 1, '2026-09-04T00:00:00+08:00', '2026-09-04T00:00:00+08:00'),
  ('sub-other',   'Other Subjects', 'cat-academics', '#0a84ff', 5, 1, '2026-09-04T00:00:00+08:00', '2026-09-04T00:00:00+08:00');

-- ---------------------------------------------------------------------------
-- 7. 旧学科分类的历史数据改挂 Academics + 对应 Subject
--    'Mathematics' 是生产库里 2 条未注册分类的脏数据，一并归入 Math。
--    'Personal' 是 0003 改名时只更新了 events、漏掉 deadlines 留下的残留。
-- ---------------------------------------------------------------------------
UPDATE deadlines SET category = 'Leisure' WHERE category = 'Personal';

UPDATE events       SET category = 'Academics', subject_id = 'sub-math'    WHERE category IN ('Math', 'Mathematics');
UPDATE deadlines    SET category = 'Academics', subject_id = 'sub-math'    WHERE category IN ('Math', 'Mathematics');
UPDATE event_series SET category = 'Academics', subject_id = 'sub-math'    WHERE category IN ('Math', 'Mathematics');

UPDATE events       SET category = 'Academics', subject_id = 'sub-physics' WHERE category = 'Physics';
UPDATE deadlines    SET category = 'Academics', subject_id = 'sub-physics' WHERE category = 'Physics';
UPDATE event_series SET category = 'Academics', subject_id = 'sub-physics' WHERE category = 'Physics';

UPDATE events       SET category = 'Academics', subject_id = 'sub-cs'      WHERE category = 'CS';
UPDATE deadlines    SET category = 'Academics', subject_id = 'sub-cs'      WHERE category = 'CS';
UPDATE event_series SET category = 'Academics', subject_id = 'sub-cs'      WHERE category = 'CS';

UPDATE events       SET category = 'Academics', subject_id = 'sub-other'   WHERE category = 'Other Subjects';
UPDATE deadlines    SET category = 'Academics', subject_id = 'sub-other'   WHERE category = 'Other Subjects';
UPDATE event_series SET category = 'Academics', subject_id = 'sub-other'   WHERE category = 'Other Subjects';

-- ---------------------------------------------------------------------------
-- 8. 归档旧学科分类（保留行，让旧订阅 URL 仍可解析）
-- ---------------------------------------------------------------------------
UPDATE categories SET archived = 1
  WHERE id IN ('cat-math', 'cat-physics', 'cat-cs', 'cat-school');

-- ---------------------------------------------------------------------------
-- 9. 标签建议随学科下沉到 Subject
--    Academics 自身保留一份学业通用建议，供未指定科目时使用。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subject_tag_suggestions (
  subject_id  TEXT NOT NULL,
  tag_id      TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_tag_suggestions_tag_id
  ON subject_tag_suggestions (tag_id);

INSERT OR IGNORE INTO subject_tag_suggestions (subject_id, tag_id, sort_order)
  SELECT 'sub-math', tag_id, sort_order FROM category_tag_suggestions WHERE category_id = 'cat-math';
INSERT OR IGNORE INTO subject_tag_suggestions (subject_id, tag_id, sort_order)
  SELECT 'sub-physics', tag_id, sort_order FROM category_tag_suggestions WHERE category_id = 'cat-physics';
INSERT OR IGNORE INTO subject_tag_suggestions (subject_id, tag_id, sort_order)
  SELECT 'sub-cs', tag_id, sort_order FROM category_tag_suggestions WHERE category_id = 'cat-cs';
INSERT OR IGNORE INTO subject_tag_suggestions (subject_id, tag_id, sort_order)
  SELECT 'sub-other', tag_id, sort_order FROM category_tag_suggestions WHERE category_id = 'cat-school';
INSERT OR IGNORE INTO subject_tag_suggestions (subject_id, tag_id, sort_order)
  SELECT 'sub-english', tag_id, sort_order FROM category_tag_suggestions WHERE category_id = 'cat-school';

INSERT OR IGNORE INTO category_tag_suggestions (category_id, tag_id, sort_order)
  SELECT 'cat-academics', tag_id, sort_order FROM category_tag_suggestions WHERE category_id = 'cat-school';

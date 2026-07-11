-- AI0506 Calendar — Migration 0004: keep only the rewritten categories
-- Events using removed/custom categories are kept and moved to Tech.

UPDATE events
SET category = 'Tech'
WHERE category IS NOT NULL
  AND category NOT IN (
    'Math', 'Physics', 'CS', 'Other Subjects',
    'Research', 'Projects', 'Leisure', 'Tech'
  );

DELETE FROM categories
WHERE id NOT IN (
  'cat-math', 'cat-physics', 'cat-cs', 'cat-school',
  'cat-research', 'cat-project', 'cat-personal', 'cat-other'
);

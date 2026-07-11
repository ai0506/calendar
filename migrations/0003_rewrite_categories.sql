-- AI0506 Calendar — Migration 0003: rewrite default categories
-- Rename categories and migrate existing event category values together.

UPDATE events SET category = 'Other Subjects' WHERE category = 'School';
UPDATE events SET category = 'CS' WHERE category = 'Computer Science';
UPDATE events SET category = 'Projects' WHERE category = 'Project';
UPDATE events SET category = 'Leisure' WHERE category = 'Personal';
UPDATE events SET category = 'Tech' WHERE category = 'Other';

UPDATE categories SET name = 'Other Subjects' WHERE id = 'cat-school';
UPDATE categories SET name = 'CS' WHERE id = 'cat-cs';
UPDATE categories SET name = 'Projects' WHERE id = 'cat-project';
UPDATE categories SET name = 'Leisure' WHERE id = 'cat-personal';
UPDATE categories SET name = 'Tech' WHERE id = 'cat-other';

UPDATE categories SET sort_order = 1 WHERE id = 'cat-math';
UPDATE categories SET sort_order = 2 WHERE id = 'cat-physics';
UPDATE categories SET sort_order = 3 WHERE id = 'cat-cs';
UPDATE categories SET sort_order = 4 WHERE id = 'cat-school';
UPDATE categories SET sort_order = 5 WHERE id = 'cat-research';
UPDATE categories SET sort_order = 6 WHERE id = 'cat-project';
UPDATE categories SET sort_order = 7 WHERE id = 'cat-personal';
UPDATE categories SET sort_order = 8 WHERE id = 'cat-other';

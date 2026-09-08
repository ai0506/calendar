# 0012 回滚脚本

`migrations/0012_academics_subjects.sql` 把 Math / Physics / CS / Other Subjects
四个学科 Category 合并成 `Academics` + `subjects` 子类，并把写入时快照的颜色归一化。
迁移前的 `category` / `color` 原值（含软删除行）保存在 `migration_0012_backup`。

回滚时手动执行下面的 SQL（`wrangler d1 execute calendar-db --remote --file ...`）。
回滚只还原数据语义，不删除 `subjects` / `subject_id` 列本身 —— SQLite 的
`DROP COLUMN` 在 D1 上有兼容性风险，且留着空列不影响旧代码。

```sql
UPDATE events SET
  category = (SELECT b.old_category FROM migration_0012_backup b WHERE b.table_name = 'events' AND b.row_id = events.id),
  color    = (SELECT b.old_color    FROM migration_0012_backup b WHERE b.table_name = 'events' AND b.row_id = events.id),
  subject_id = NULL
WHERE id IN (SELECT row_id FROM migration_0012_backup WHERE table_name = 'events');

UPDATE deadlines SET
  category = (SELECT b.old_category FROM migration_0012_backup b WHERE b.table_name = 'deadlines' AND b.row_id = deadlines.id),
  color    = (SELECT b.old_color    FROM migration_0012_backup b WHERE b.table_name = 'deadlines' AND b.row_id = deadlines.id),
  subject_id = NULL
WHERE id IN (SELECT row_id FROM migration_0012_backup WHERE table_name = 'deadlines');

UPDATE event_series SET
  category = (SELECT b.old_category FROM migration_0012_backup b WHERE b.table_name = 'event_series' AND b.row_id = event_series.id),
  color    = (SELECT b.old_color    FROM migration_0012_backup b WHERE b.table_name = 'event_series' AND b.row_id = event_series.id),
  subject_id = NULL
WHERE id IN (SELECT row_id FROM migration_0012_backup WHERE table_name = 'event_series');

UPDATE categories SET archived = 0 WHERE id IN ('cat-math', 'cat-physics', 'cat-cs', 'cat-school');
UPDATE categories SET archived = 1 WHERE id = 'cat-academics';

-- 恢复第 6 步改淡之前的分类颜色
UPDATE categories SET color = '#7c3aed' WHERE id = 'cat-research';
UPDATE categories SET color = '#ea580c' WHERE id = 'cat-project';
UPDATE categories SET color = '#db2777' WHERE id = 'cat-personal';
UPDATE categories SET color = '#64748b' WHERE id = 'cat-other';
```

回滚后 `Academics` 分类仍存在但被归档，旧的四个学科分类重新可见。
迁移之后新建、且分类为 `Academics` 的行不在备份表里，回滚后会保留 `Academics`
分类名 —— 此时该分类已归档，需要人工决定改挂到哪个旧分类。

## 迁移前的 Time Travel 恢复点

2026-09-05 生产库执行 0012 之前的书签（比备份表更彻底，可整库回到迁移前那一刻）：

```bash
npx wrangler d1 time-travel restore calendar-db --bookmark=000005bb-00000000-000050dd-ffbbe712f630d4ddec7e900672bd4039
```

注意 Time Travel 会把**整个数据库**回退到那一刻，迁移之后新增的事件 / Deadline 也会一并消失。
只想撤销分类语义、保留新数据时，用上面的备份表回滚 SQL。

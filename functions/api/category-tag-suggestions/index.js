import { queryAll } from "../../_lib/db.js";
import { ok } from "../../_lib/response.js";

// 返回值以 id 为键：普通分类用 categories.id，Academics 的科目用 subjects.id。
// 两套 id 不会重名，前端按当前选中的分类/科目直接取用。
export async function onRequestGet(context) {
  const categoryRows = await queryAll(context.env.DB, `SELECT category_id AS owner_id, tag_id, sort_order
    FROM category_tag_suggestions ORDER BY category_id ASC, sort_order ASC, tag_id ASC`);
  const subjectRows = await queryAll(context.env.DB, `SELECT subject_id AS owner_id, tag_id, sort_order
    FROM subject_tag_suggestions ORDER BY subject_id ASC, sort_order ASC, tag_id ASC`);
  const data = {};
  for (const row of [...categoryRows, ...subjectRows]) {
    if (!data[row.owner_id]) data[row.owner_id] = [];
    data[row.owner_id].push(row.tag_id);
  }
  return ok(data);
}

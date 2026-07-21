import { queryAll } from "../../_lib/db.js";
import { ok } from "../../_lib/response.js";

export async function onRequestGet(context) {
  const rows = await queryAll(context.env.DB, `SELECT category_id, tag_id, sort_order
    FROM category_tag_suggestions ORDER BY category_id ASC, sort_order ASC, tag_id ASC`);
  const data = {};
  for (const row of rows) {
    if (!data[row.category_id]) data[row.category_id] = [];
    data[row.category_id].push(row.tag_id);
  }
  return ok(data);
}

import { queryOne } from "./db.js";

// category 是自由文本字段,与 categories.name 之间没有外键约束。
// 所有写路径（Event / Deadline / Event Series，REST 与 MCP）在写入前必须调用本函数，
// 防止调用方（含 AI Agent）凭空造出未注册的分类名。
export async function ensureCategoryExists(env, category) {
  if (category === undefined || category === null || category === "") return null;
  const row = await queryOne(env.DB, "SELECT 1 FROM categories WHERE name = ?", [category]);
  return row ? null : `category "${category}" does not exist; call GET /api/categories (or calendar_list_categories) for valid names, or create it first via POST /api/categories`;
}

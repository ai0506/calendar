import { queryOne } from "./db.js";

// category 是自由文本字段,与 categories.name 之间没有外键约束。
// 所有写路径（Event / Deadline / Event Series，REST 与 MCP）在写入前必须调用本函数，
// 防止调用方（含 AI Agent）凭空造出未注册的分类名。
export async function ensureCategoryExists(env, category) {
  if (category === undefined || category === null || category === "") return null;
  const row = await queryOne(env.DB, "SELECT archived FROM categories WHERE name = ?", [category]);
  if (!row) return `category "${category}" does not exist; call GET /api/categories (or calendar_list_categories) for valid names, or create it first via POST /api/categories`;
  // 归档分类（如迁移前的 Math / Physics / CS / Other Subjects）只保留历史可读性，不接受新写入。
  if (row.archived === 1) return `category "${category}" is archived and no longer accepts writes; use the academics category with a subject_id instead`;
  return null;
}

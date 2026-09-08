// Subject 是 Academics 这个特殊 Category 专属的子类（学科）。
//
// 语义（见 production/COURSE_SCHEDULE_PLAN.md）：
//   category.kind = 'academics' + subject_id 有值 → 该科目
//   category.kind = 'academics' + subject_id 为空 → 学业但未指定科目，用 Category 颜色
//   category.kind = 'normal'                      → subject_id 必须为空
//
// 所有写路径（REST / MCP / Import，Event / Deadline / Series）在写入前都必须调用
// validateCategorySubject，避免 AI Agent 造出「Leisure + Math」这类非法组合。

import { queryAll, queryOne } from "./db.js";

export async function listSubjects(env, { includeInactive = false } = {}) {
  const sql = includeInactive
    ? "SELECT * FROM subjects ORDER BY sort_order ASC, name ASC"
    : "SELECT * FROM subjects WHERE active = 1 ORDER BY sort_order ASC, name ASC";
  return queryAll(env.DB, sql);
}

/**
 * 校验 category / subject_id 的组合是否合法。
 * @param {object} env
 * @param {string|null|undefined} category 分类名（与 categories.name 对应）
 * @param {string|null|undefined} subjectId
 * @returns {Promise<string|null>} 错误信息，null 表示通过
 */
export async function validateCategorySubject(env, category, subjectId) {
  const hasSubject = subjectId !== undefined && subjectId !== null && subjectId !== "";
  if (!hasSubject) return null;
  if (typeof subjectId !== "string") return "subject_id must be a string";

  if (category === undefined || category === null || category === "") {
    return "subject_id requires a category; set category to the academics category first";
  }

  const categoryRow = await queryOne(
    env.DB,
    "SELECT id, kind FROM categories WHERE name = ?",
    [category],
  );
  // category 本身是否存在由 ensureCategoryExists 负责，这里只判断 kind。
  if (!categoryRow) return null;
  if (categoryRow.kind !== "academics") {
    return `category "${category}" has no subjects; subject_id is only valid for the academics category`;
  }

  const subject = await queryOne(
    env.DB,
    "SELECT id, category_id, active FROM subjects WHERE id = ?",
    [subjectId],
  );
  if (!subject) {
    return `subject "${subjectId}" does not exist; call GET /api/subjects (or calendar_list_subjects) for valid ids`;
  }
  if (subject.category_id !== categoryRow.id) {
    return `subject "${subjectId}" does not belong to category "${category}"`;
  }
  if (subject.active !== 1) {
    return `subject "${subjectId}" is inactive and cannot be assigned to new items`;
  }
  return null;
}

/**
 * 分类从 academics 改成普通分类时，subject_id 必须一并清空。
 * 返回合并后应写入的 subject_id（调用方负责把它带进 UPDATE）。
 */
export async function subjectIdAfterCategoryChange(env, category, subjectId) {
  if (subjectId === undefined || subjectId === null || subjectId === "") return null;
  if (category === undefined || category === null || category === "") return null;
  const categoryRow = await queryOne(env.DB, "SELECT kind FROM categories WHERE name = ?", [category]);
  return categoryRow?.kind === "academics" ? subjectId : null;
}

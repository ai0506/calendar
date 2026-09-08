// Category / Subject 联动校验（migration 0012）。
// 用一个最小的 D1 桩替代真实数据库：只需要 prepare().bind().first()。

import assert from "node:assert/strict";
import { validateCategorySubject, subjectIdAfterCategoryChange } from "../functions/_lib/subjects.js";

const CATEGORIES = {
  Academics: { id: "cat-academics", kind: "academics" },
  Research: { id: "cat-research", kind: "normal" },
};
const SUBJECTS = {
  "sub-math": { id: "sub-math", category_id: "cat-academics", active: 1 },
  "sub-retired": { id: "sub-retired", category_id: "cat-academics", active: 0 },
  "sub-elsewhere": { id: "sub-elsewhere", category_id: "cat-other", active: 1 },
};

const env = {
  DB: {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes("FROM categories")) return CATEGORIES[params[0]] || null;
              if (sql.includes("FROM subjects")) return SUBJECTS[params[0]] || null;
              return null;
            },
          };
        },
      };
    },
  },
};

// 不带 subject 一律通过（包括普通分类和空分类）。
assert.equal(await validateCategorySubject(env, "Research", null), null);
assert.equal(await validateCategorySubject(env, "Research", ""), null);
assert.equal(await validateCategorySubject(env, undefined, undefined), null);
assert.equal(await validateCategorySubject(env, "Academics", null), null);

// academics 分类 + 有效科目：通过。
assert.equal(await validateCategorySubject(env, "Academics", "sub-math"), null);

// 普通分类不接受 subject_id。
assert.match(await validateCategorySubject(env, "Research", "sub-math"), /only valid for the academics category/);

// 没有分类却给了科目。
assert.match(await validateCategorySubject(env, null, "sub-math"), /requires a category/);

// 科目不存在 / 不属于该分类 / 已停用。
assert.match(await validateCategorySubject(env, "Academics", "sub-missing"), /does not exist/);
assert.match(await validateCategorySubject(env, "Academics", "sub-elsewhere"), /does not belong to/);
assert.match(await validateCategorySubject(env, "Academics", "sub-retired"), /inactive/);

// 类型错误。
assert.match(await validateCategorySubject(env, "Academics", 42), /must be a string/);

// 分类降级时清空 subject_id，留在 academics 时保留。
assert.equal(await subjectIdAfterCategoryChange(env, "Research", "sub-math"), null);
assert.equal(await subjectIdAfterCategoryChange(env, "Academics", "sub-math"), "sub-math");
assert.equal(await subjectIdAfterCategoryChange(env, "Academics", null), null);

console.log("subjects tests passed");

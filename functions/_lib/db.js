// D1 查询辅助（保持简单，不引入 ORM）
//
// 所有查询均使用参数化 SQL（D1 的 .bind()），避免 SQL 注入。
// env.DB 为 wrangler.toml 中绑定的 D1 数据库。

/**
 * 执行查询并返回所有行。
 * @param {D1Database} db
 * @param {string} sql   含 ? 占位符的 SQL
 * @param {any[]} [params]
 * @returns {Promise<object[]>}
 */
export async function queryAll(db, sql, params = []) {
  const { results } = await db
    .prepare(sql)
    .bind(...params)
    .all();
  return results || [];
}

/**
 * 执行查询并返回首行（无则 null）。
 * @returns {Promise<object|null>}
 */
export async function queryOne(db, sql, params = []) {
  const row = await db
    .prepare(sql)
    .bind(...params)
    .first();
  return row || null;
}

/**
 * 执行写操作（INSERT / UPDATE / DELETE）。
 * @returns {Promise<D1Result>}
 */
export async function run(db, sql, params = []) {
  return db
    .prepare(sql)
    .bind(...params)
    .run();
}

// 路由级测试用的最小 D1 桩。
//
// 不是 SQL 引擎：只按本仓库实际用到的语句形状做分派，够跑通
// /api/deadlines、/api/course-catalog 与 /mcp 的 Deadline 路径即可。
// 刻意不实现的部分（调用方需要知道）：
//   - deadlines 列表的 substr(due_time,...) 日期窗口、category/subject/tag 过滤
//     一律不生效，列表查询返回全部未软删除的行；
//   - reminders / last_modified_by 等写入只记录不落表。
// 需要更真实的行为时请用本地 D1（npm run db:local），不要把这里扩成 ORM。

const INSERT_RE = /^INSERT(?:\s+OR\s+\w+)?\s+INTO\s+(\w+)\s*\(([^)]*)\)/i;
const UPDATE_RE = /^UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)\s+WHERE\s/i;
const DELETE_RE = /^DELETE\s+FROM\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*\?/i;

function squish(sql) {
  return sql.replace(/\s+/g, " ").trim();
}

export function createFakeD1(seed = {}) {
  const tables = {
    categories: [],
    subjects: [],
    courses: [],
    deadlines: [],
    tags: [],
    deadline_tags: [],
    ...seed,
  };
  const writes = [];

  function select(sql, params) {
    const s = squish(sql);
    if (/FROM categories WHERE name = \?/i.test(s)) {
      return tables.categories.filter((row) => row.name === params[0]);
    }
    if (/FROM subjects WHERE id = \?/i.test(s)) {
      return tables.subjects.filter((row) => row.id === params[0]);
    }
    if (/FROM courses WHERE id = \?/i.test(s)) {
      return tables.courses.filter((row) => row.id === params[0]);
    }
    if (/FROM courses/i.test(s)) {
      // course catalog：active 在前，然后按名称
      return [...tables.courses]
        .sort((a, b) => (b.active ?? 0) - (a.active ?? 0) || String(a.name).localeCompare(String(b.name)))
        .map(({ id, name, subject_id, active }) => ({ id, name, subject_id, active }));
    }
    if (/FROM deadlines WHERE id = \? AND deleted_at IS NULL/i.test(s)) {
      return tables.deadlines.filter((row) => row.id === params[0] && !row.deleted_at);
    }
    if (/^SELECT \* FROM deadlines WHERE deleted_at IS NULL/i.test(s)) {
      // 日期窗口与筛选条件不模拟，见文件头说明。
      return tables.deadlines.filter((row) => !row.deleted_at);
    }
    if (/FROM tags WHERE id IN/i.test(s)) {
      return tables.tags.filter((row) => params.includes(row.id));
    }
    if (/FROM deadline_tags/i.test(s) || /deadline_tags dt/i.test(s)) {
      return [];
    }
    if (/FROM tags/i.test(s)) {
      return tables.tags;
    }
    throw new Error(`fake-d1: 未覆盖的查询：${s}`);
  }

  function write(sql, params) {
    const s = squish(sql);
    writes.push({ sql: s, params });
    const insert = s.match(INSERT_RE);
    if (insert) {
      const [, table, columnList] = insert;
      if (!tables[table]) return;
      const columns = columnList.split(",").map((name) => name.trim());
      const row = {};
      columns.forEach((name, index) => { row[name] = params[index]; });
      const existing = tables[table].findIndex((item) => item.id !== undefined && item.id === row.id);
      if (existing >= 0) tables[table][existing] = row; else tables[table].push(row);
      return;
    }
    const update = s.match(UPDATE_RE);
    if (update) {
      const [, table, setList] = update;
      if (!tables[table]) return;
      const fields = setList.split(",").map((part) => part.trim().split("=")[0].trim());
      const bound = fields.filter((_, index) => setList.split(",")[index].includes("?"));
      const id = params[params.length - 1];
      const row = tables[table].find((item) => item.id === id);
      if (!row) return;
      bound.forEach((field, index) => { row[field] = params[index]; });
      return;
    }
    const remove = s.match(DELETE_RE);
    if (remove) {
      const [, table, column] = remove;
      if (!tables[table]) return;
      tables[table] = tables[table].filter((row) => row[column] !== params[0]);
    }
  }

  const db = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            sql,
            params,
            async all() { return { results: select(sql, params) }; },
            async first() { return select(sql, params)[0] || null; },
            async run() { write(sql, params); return { success: true }; },
          };
        },
      };
    },
    async batch(statements) {
      for (const statement of statements) await statement.run();
      return statements.map(() => ({ success: true }));
    },
  };

  return { db, tables, writes };
}

export function jsonRequest(url, method, body, headers = {}) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function readJson(response) {
  return { status: response.status, body: await response.json() };
}

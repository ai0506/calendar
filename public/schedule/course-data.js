// =============================================================================
// G11 AL 1班 课表 —— 唯一数据源
// 来源：《G11 AL 1班.xlsx》，按该学生选课分层筛出：
//   AS经济· 计算机· ESL 1层 · EL L1 ·
//   Speaking L1A · AS数学 L1A· 政治。
// 课表页 (/schedule/) 与 ICS 订阅 (/schedule.ics) 都从这里读，改课表只改这个文件。
// =============================================================================

export const PERIODS = [
  { n: "第1节", s: "08:00", e: "08:45" },
  { n: "第2节", s: "08:55", e: "09:40" },
  { n: "第3节", s: "09:50", e: "10:35" },
  { n: "第4节", s: "10:45", e: "11:30" },
  { n: "第5节", s: "13:10", e: "14:10" },
  { n: "第6节", s: "14:20", e: "15:00" },
  { n: "第7节", s: "15:15", e: "15:55" },
  { n: "第8节", s: "16:05", e: "16:45" },
];
// 第4节之后是午休。原表第9节 16:55–17:35 五天全空，未录入。
export const LUNCH_AFTER = 3;

export const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];
export const ICAL_DAYS = ["MO", "TU", "WE", "TH", "FR"];

// GRID[periodIndex][dayIndex]
export const GRID = [
  ["AS物理 L1[318]", "AS经济[318]", "ESL 1层A 雅思外教口语[319]", "AS物理 L1[318]", "AS物理 L1[318]"],
  ["升旗 [318]", "AS经济[318]", "AS物理 L1[318]", "语文分层[318]", "计算机[413]"],
  ["AS经济[318]", "AS物理 L1[318]", "AS物理 L1[318]", "计算机[413]", "AS数学 L1A[318]"],
  ["Speaking L1A[322]", "计算机[413]", "AS数学 L1A[318]", "计算机[413]", "ESL 1层A 雅思外教口语[319]"],
  ["ESL 1层 雅思写作[319]", "EL L1[318]", "AS经济[318]", "AS数学 L1A[318]", "EL L1[318]"],
  ["计算机[312]", "AS数学 L1A[318]", "计算机[410]", "EL L1[318]", "ESL 1层B 雅思口语[318]"],
  ["AS数学 L1A[318]", "AS数学 L1A[318]", "政治[205]", "ESL 1层B 雅思口语[318]", "AS经济[318]"],
  ["语文分层[318]", "PE [318]", "PE [318]", "ESL 1层 雅思写作[319]", "AS经济[318]"],
];

// 每周 ≥ MIN_LESSONS 节的科目单独配色；配色取自 ui-preview/design-a-c.html 的 Apple 系统色板。
export const MIN_LESSONS = 3;
export const FAMILIES = [
  { id: "phys", label: "AS 物理", color: "#0A84FF", test: (s) => s.startsWith("AS物理") },
  { id: "math", label: "AS 数学", color: "#AF52DE", test: (s) => s.startsWith("AS数学") },
  { id: "cs",   label: "计算机",  color: "#30B855", test: (s) => s.startsWith("计算机") },
  { id: "econ", label: "AS 经济", color: "#FF9F0A", test: (s) => s.startsWith("AS经济") },
  { id: "esl",  label: "ESL",     color: "#32ADE6", test: (s) => s.startsWith("ESL") },
  { id: "el",   label: "EL L1",   color: "#FF2D55", test: (s) => s.startsWith("EL ") },
];
export const OTHER = { id: "other", label: "其他科目", color: "#8E8E93" };

// 分层标记在整张表里恒定，是噪音；
// 精简后更好读，完整原文仍保留在 raw 里。
export function shorten(name) {
  const out = name
    .replace(/\s*L\d[A-Z]?(?=\s|$)/g, "")
    .replace(/\s*\d层[A-Z]?(?=\s|$)/g, "")
    .replace(/一层$/, "")
    .replace(/^AS(?=\S)/, "AS ")
    .replace(/\s+/g, " ")
    .trim();
  return out.length >= 3 ? out : name;   // 缩得太短反而认不出，就保留原名
}

// "AS物理 L1[318]" -> { name, short, teacher, room, raw }
export function parse(raw) {
  if (!raw) return null;
  let s = raw.trim();
  let room = "", teacher = "";
  const mRoom = s.match(/\[([^\]]+)\]\s*$/);
  if (mRoom) { room = mRoom[1]; s = s.slice(0, mRoom.index).trim(); }
  const mT = s.match(/（([^）]+)）\s*$/);
  if (mT) { teacher = mT[1]; s = s.slice(0, mT.index).trim(); }
  return { name: s, short: shorten(s), teacher, room, raw: raw.trim() };
}

export const LESSONS = GRID.map((row) => row.map(parse));

export const COUNTS = (() => {
  const m = new Map();
  for (const row of LESSONS) for (const c of row) {
    if (!c) continue;
    const f = FAMILIES.find((x) => x.test(c.raw));
    const id = f ? f.id : OTHER.id;
    m.set(id, (m.get(id) || 0) + 1);
  }
  return m;
})();

export const COLORED = FAMILIES.filter((f) => (COUNTS.get(f.id) || 0) >= MIN_LESSONS);
export const familyOf = (cell) => (cell ? COLORED.find((f) => f.test(cell.raw)) || OTHER : OTHER);

import { safeEqual } from "./auth.js";
import { queryAll, queryOne } from "./db.js";
import { attachTagsToEvents } from "./tags.js";
import { calendarIcs } from "./ics.js";

const TOKEN_ENV = "ICS_SUBSCRIPTION_TOKEN";

export function subscriptionTokenConfigured(env) {
  return typeof env[TOKEN_ENV] === "string" && env[TOKEN_ENV].length >= 32;
}

export function validSubscriptionToken(token, env) {
  return subscriptionTokenConfigured(env) && typeof token === "string" && safeEqual(token, env[TOKEN_ENV]);
}

// 订阅列表里不列 academics 这个「总的」分类 —— 它下面的科目会以 subject feed
// 单独列出，再摆一条把五科混在一起的 Academics feed 只会让订阅列表更难挑。
// 注意只是不列出：/subscribe/<token>/all.ics?category=cat-academics 仍然可用，
// 迁移前后拿到过该 URL 的客户端不会失效。
export async function subscriptionCategories(env) {
  return queryAll(
    env.DB,
    "SELECT id, name, color, kind FROM categories WHERE archived = 0 AND kind <> 'academics' ORDER BY sort_order ASC, name ASC",
  );
}

export async function subscriptionSubjects(env) {
  return queryAll(env.DB, "SELECT id, name, color, category_id FROM subjects WHERE active = 1 ORDER BY sort_order ASC, name ASC");
}

export function subscriptionUrls(origin, token, categories, subjects = []) {
  const root = `${origin}/subscribe/${encodeURIComponent(token)}`;
  return {
    all: `${root}/all.ics`,
    categories: categories.map((category) => ({
      ...category,
      url: `${root}/all.ics?category=${encodeURIComponent(category.id)}`,
    })),
    subjects: subjects.map((subject) => ({
      ...subject,
      url: `${root}/all.ics?subject=${encodeURIComponent(subject.id)}`,
    })),
  };
}

// 「All events」这条混合 feed 的日历色，与网页端订阅面板里那颗蓝点一致。
const ALL_EVENTS_COLOR = "#0071e3";

export async function icsResponse(env, { categoryId = null, subjectId = null } = {}) {
  let whereSql = "deleted_at IS NULL";
  const params = [];
  let name = "AI0506 Calendar";
  let description = "Private AI0506 Calendar events";
  let color = ALL_EVENTS_COLOR;

  if (subjectId) {
    const subject = await queryOne(env.DB, "SELECT id, name, color FROM subjects WHERE id = ?", [subjectId]);
    if (!subject) return null;
    whereSql += " AND subject_id = ?";
    params.push(subject.id);
    name = `AI0506 · ${subject.name}`;
    description = `${subject.name} events from AI0506 Calendar`;
    color = subject.color;
  } else if (categoryId) {
    const category = await queryOne(env.DB, "SELECT id, name, color, archived FROM categories WHERE id = ?", [categoryId]);
    if (!category) return null;
    // 迁移 0012 之前，Math / Physics / CS / Other Subjects 是独立分类，且已经
    // 被 Apple 日历按分类 id 订阅。分类归档后按分类名过滤会返回空日历（客户端
    // 不报错，只是事件全部消失），因此把归档分类重定向到同名 Subject。
    const fallbackSubject = category.archived === 1
      ? await queryOne(env.DB, "SELECT id, name, color FROM subjects WHERE name = ?", [category.name])
      : null;
    if (fallbackSubject) {
      whereSql += " AND subject_id = ?";
      params.push(fallbackSubject.id);
      name = `AI0506 · ${fallbackSubject.name}`;
      description = `${fallbackSubject.name} events from AI0506 Calendar`;
      color = fallbackSubject.color;
    } else {
      whereSql += " AND category = ?";
      params.push(category.name);
      name = `AI0506 · ${category.name}`;
      description = `${category.name} events from AI0506 Calendar`;
      color = category.color;
    }
  }

  const rows = await queryAll(env.DB, `SELECT * FROM events WHERE ${whereSql} ORDER BY start_time ASC`, params);
  const tagged = await attachTagsToEvents(env, rows, whereSql, params);
  const events = await withDisplayColors(env, tagged);
  return calendarIcs({ name, description, events, color });
}

// 每条事件的最终颜色，与网页端的解析顺序一致：显式色 > 科目色 > 分类色。
// 迁移 0012 之后 events.color 基本都是 NULL（跟随分类/科目），所以这里必须查表补齐。
async function withDisplayColors(env, events) {
  if (!events.length) return events;
  const [categories, subjects] = await Promise.all([
    queryAll(env.DB, "SELECT name, color FROM categories"),
    queryAll(env.DB, "SELECT id, color FROM subjects"),
  ]);
  const categoryColors = new Map(categories.map((row) => [row.name, row.color]));
  const subjectColors = new Map(subjects.map((row) => [row.id, row.color]));
  return events.map((event) => ({
    ...event,
    display_color: event.color
      || (event.subject_id ? subjectColors.get(event.subject_id) : null)
      || categoryColors.get(event.category)
      || null,
  }));
}

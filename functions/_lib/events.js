// events 相关的共享辅助：字段校验、时间校验、行序列化。
// 保持简单，供 index.js 与 [id].js 复用，避免重复逻辑。

// 客户端可提供的字段（POST 创建 / PUT 更新）。
// id / created_at / updated_at / deleted_at 由服务器管理，不接受客户端写入。
export const EVENT_FIELDS = [
  "title",
  "description",
  "start_time",
  "end_time",
  "all_day",
  "category",
  "color",
  "group_title",
  "source",
  "external_id",
];

// ISO 8601：日期，或日期+时间+时区偏移(Z 或 ±HH:MM)。
// 例如 2026-07-14 / 2026-07-14T19:00:00+08:00 / 2026-07-14T11:00:00Z
const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2}))?$/;

export function isValidIso(v) {
  return typeof v === "string" && ISO_8601.test(v);
}

function isDateOnlyValue(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Check temporal ordering after basic ISO validation has passed.
 * Date-only all-day events may use the same start/end date; timed events
 * must have an end strictly after the start on a common time axis.
 */
export function validateEventTemporalOrder(input) {
  const start = input?.start_time;
  const end = input?.end_time;
  if (!start || end === undefined || end === null || end === "") return null;
  if (isDateOnlyValue(start) && isDateOnlyValue(end) && toIntBool(input.all_day) === 1) {
    if (end < start) return "end_time must not be before start_time";
    return null;
  }
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  if (endMs <= startMs) return "end_time must be after start_time";
  return null;
}

/** 服务器生成的时间戳（ISO 8601，Z 即 +00:00 偏移）。 */
export function nowIso() {
  return new Date().toISOString();
}

/** 将 all_day 归一化为 0/1。 */
export function toIntBool(v) {
  return v === true || v === 1 || v === "1" ? 1 : 0;
}

/** D1 行 -> 对外事件对象（all_day 转布尔）。 */
export function rowToEvent(row) {
  if (!row) return row;
  return { ...row, all_day: row.all_day === 1 };
}

/**
 * 校验事件输入字段。
 * @param {object} input 客户端提交的字段
 * @param {boolean} requireCore 是否要求 title / start_time 必填（创建时 true）
 * @returns {string|null} 错误信息，null 表示通过
 */
export function validateEventInput(input, requireCore) {
  if (requireCore) {
    if (typeof input.title !== "string" || input.title.trim() === "") {
      return "title is required and must be a non-empty string";
    }
    if (!isValidIso(input.start_time)) {
      return "start_time is required and must be ISO 8601 (with timezone offset)";
    }
  } else {
    if (
      input.title !== undefined &&
      (typeof input.title !== "string" || input.title.trim() === "")
    ) {
      return "title must be a non-empty string";
    }
    if (input.start_time !== undefined && !isValidIso(input.start_time)) {
      return "start_time must be ISO 8601 (with timezone offset)";
    }
  }

  if (input.end_time !== undefined && input.end_time !== null && input.end_time !== "") {
    if (!isValidIso(input.end_time)) {
      return "end_time must be ISO 8601 (with timezone offset)";
    }
  }

  // 其余可选文本字段：若提供，必须是字符串或 null
  for (const f of ["description", "category", "color", "group_title", "source", "external_id"]) {
    if (input[f] !== undefined && input[f] !== null && typeof input[f] !== "string") {
      return `${f} must be a string`;
    }
  }
  return null;
}

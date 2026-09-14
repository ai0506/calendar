import { queryAll, queryOne, run } from "./db.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(["cancel", "cancel_day"]);

function dateValue(key) {
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(key, amount) {
  const date = dateValue(key);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekNumber(termStart, date) {
  const start = dateValue(termStart);
  const current = dateValue(date);
  return Math.floor((current - start) / 86400000 / 7) + 1;
}

function inSlotWeek(slot, week) {
  if (slot.first_week != null && week < slot.first_week) return false;
  if (slot.last_week != null && week > slot.last_week) return false;
  if (slot.week_pattern === "odd" && week % 2 !== 1) return false;
  if (slot.week_pattern === "even" && week % 2 !== 0) return false;
  return true;
}

export async function listCourseSchedule(env, from, to) {
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || !dateValue(from) || !dateValue(to) || from > to) {
    throw new Error("from and to must be valid date-only values");
  }
  const terms = await queryAll(env.DB, "SELECT * FROM terms WHERE start_date <= ? AND end_date >= ? ORDER BY start_date", [to, from]);
  if (!terms.length) return [];
  const rows = [];
  for (const term of terms) {
    const courses = await queryAll(env.DB, `SELECT c.*, s.name AS subject_name, s.color AS subject_color
      FROM courses c JOIN subjects s ON s.id = c.subject_id
      WHERE c.term_id = ? AND c.active = 1 AND s.active = 1`, [term.id]);
    const slots = await queryAll(env.DB, `SELECT cs.*, c.name, c.teacher, c.notes, c.subject_id,
      s.name AS subject_name, s.color AS subject_color
      FROM course_slots cs JOIN courses c ON c.id = cs.course_id
      JOIN subjects s ON s.id = c.subject_id
      WHERE c.term_id = ? AND c.active = 1 AND s.active = 1`, [term.id]);
    const overrides = await queryAll(env.DB, "SELECT * FROM course_overrides WHERE term_id = ? AND effective_date BETWEEN ? AND ?", [term.id, from, to]);
    const cancelledDays = new Set(overrides.filter((item) => item.kind === "cancel_day").map((item) => item.effective_date));
    const cancelledSlots = new Set(overrides.filter((item) => item.kind === "cancel").map((item) => `${item.course_slot_id}|${item.effective_date}`));
    for (let date = from; date <= to; date = addDays(date, 1)) {
      if (date < term.start_date || date > term.end_date || cancelledDays.has(date)) continue;
      const weekday = dateValue(date).getUTCDay() || 7;
      const week = weekNumber(term.start_date, date);
      for (const slot of slots) {
        if (slot.weekday !== weekday || !inSlotWeek(slot, week) || cancelledSlots.has(`${slot.id}|${date}`)) continue;
        rows.push({
          id: `course:${slot.id}:${date}`,
          date,
          term_id: term.id,
          course_id: slot.course_id,
          course_slot_id: slot.id,
          title: slot.name,
          teacher: slot.teacher || null,
          room: slot.room || null,
          start_time: `${date}T${slot.start_time}:00+08:00`,
          end_time: `${date}T${slot.end_time}:00+08:00`,
          subject_id: slot.subject_id,
          subject_name: slot.subject_name,
          color: slot.subject_color,
          status: "scheduled",
        });
      }
    }
  }
  return rows.sort((a, b) => a.start_time.localeCompare(b.start_time) || a.title.localeCompare(b.title));
}

export async function createCourseLeave(env, body) {
  const kind = body.kind;
  if (!KINDS.has(kind)) throw new Error("Only cancel and cancel_day are available in the web client");
  if (typeof body.effective_date !== "string" || !DATE_RE.test(body.effective_date) || !dateValue(body.effective_date)) throw new Error("effective_date must be a valid date-only value");
  const term = await queryOne(env.DB, "SELECT id FROM terms WHERE start_date <= ? AND end_date >= ? ORDER BY start_date LIMIT 1", [body.effective_date, body.effective_date]);
  if (!term) throw new Error("No active term covers this date");
  if (kind === "cancel" && (typeof body.course_slot_id !== "string" || !body.course_slot_id)) throw new Error("course_slot_id is required for a single-course leave");
  if (kind === "cancel") {
    const slot = await queryOne(env.DB, "SELECT id FROM course_slots WHERE id = ?", [body.course_slot_id]);
    if (!slot) throw new Error("course_slot_id does not exist");
  }
  const now = new Date().toISOString();
  const row = { id: crypto.randomUUID(), term_id: term.id, effective_date: body.effective_date, kind, course_slot_id: kind === "cancel" ? body.course_slot_id : null, course_id: null, replacement_date: null, start_time: null, end_time: null, room: null, title: null, teacher: null, subject_id: null, details_json: null, created_at: now, updated_at: now };
  await run(env.DB, `INSERT INTO course_overrides
    (id, term_id, effective_date, kind, course_slot_id, course_id, replacement_date, start_time, end_time, room, title, teacher, subject_id, details_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, Object.values(row));
  return row;
}

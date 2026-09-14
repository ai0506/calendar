// GET /schedule.ics — G11 AL 1班 课表的公开 ICS 订阅源（临时）。
// 课程数据来自 public/schedule/course-data.js，与 /schedule/ 页面共用同一份。
//
// Apple 日历相关取舍（见 RFC 5545 / RFC 7986）：
//   · 上课时间是墙钟时间，必须用 DTSTART;TZID=Asia/Shanghai + 自带 VTIMEZONE，
//     不能转成 UTC —— 否则换时区或将来改时区规则时会整体错位。
//   · 每个「节次 × 星期」是一条 FREQ=WEEKLY 的重复事件，共 40 条；
//     UNTIL 必须是 UTC 形式（RFC 5545 §3.3.10）。
//   · REFRESH-INTERVAL (RFC 7986) 与 X-PUBLISHED-TTL (微软系) 都只是建议值，
//     Apple 允许用户在「订阅日历 → 刷新频率」里自行覆盖，所以两个都写上。
//   · DTSTAMP 用固定的数据版本号而非 Date.now()，让同一份课表每次请求产出
//     完全相同的字节，便于缓存，也避免客户端误判为「日历变了」。

import { escapeText, foldLine } from "./_lib/ics.js";
import { PERIODS, ICAL_DAYS, LESSONS, familyOf } from "../public/schedule/course-data.js";

// ---- 学期范围：改课表 / 换学期时只改这三行 --------------------------------
const TERM_FIRST_MONDAY = "2026-08-31";   // 第一周的周一（重复事件的锚点）
const TERM_LAST_DAY = "2027-01-31";       // 最后一天（含），本学期结束
const DATA_REVISION = "20260914T140000Z"; // 课表内容版本；改数据时同步更新
// ---------------------------------------------------------------------------

const TZID = "Asia/Shanghai";
const DOMAIN = "calendar.ai0506.com";
const CAL_NAME = "G11 AL 1班 课表";

// Asia/Shanghai 自 1991 年起不再实行夏令时，因此只需一个 STANDARD 分量。
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  `X-LIC-LOCATION:${TZID}`,
  "BEGIN:STANDARD",
  "DTSTART:19910915T000000",
  "TZOFFSETFROM:+0900",
  "TZOFFSETTO:+0800",
  "TZNAME:CST",
  "END:STANDARD",
  "END:VTIMEZONE",
];

// "2026-08-31" + n 天 -> "20260907"
function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// 带 TZID 的重复事件，UNTIL 必须写成 UTC：本地 23:59:59 (+08) = 前一日 15:59:59Z
function untilUtc(isoDate) {
  const d = new Date(`${isoDate}T23:59:59+08:00`);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function eventLines(cell, pi, di) {
  const period = PERIODS[pi];
  const date = addDays(TERM_FIRST_MONDAY, di);
  const hhmm = (t) => `${t.slice(0, 2)}${t.slice(3, 5)}00`;
  const detail = [
    `${period.n} ${period.s}–${period.e}`,
    cell.teacher ? `教师：${cell.teacher}` : null,
    cell.room ? `教室：${cell.room}` : null,
    `课表原文：${cell.raw}`,
  ].filter(Boolean).join("\n");

  const lines = [
    "BEGIN:VEVENT",
    `UID:g11al1-p${pi + 1}-${ICAL_DAYS[di].toLowerCase()}@${DOMAIN}`,
    `DTSTAMP:${DATA_REVISION}`,
    `LAST-MODIFIED:${DATA_REVISION}`,
    `DTSTART;TZID=${TZID}:${date}T${hhmm(period.s)}`,
    `DTEND;TZID=${TZID}:${date}T${hhmm(period.e)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${ICAL_DAYS[di]};UNTIL=${untilUtc(TERM_LAST_DAY)}`,
    `SUMMARY:${escapeText(cell.short)}`,
    `DESCRIPTION:${escapeText(detail)}`,
    `CATEGORIES:${escapeText(familyOf(cell).label)}`,
    "TRANSP:OPAQUE",
    `X-AI0506-PERIOD:${pi + 1}`,
  ];
  if (cell.room) lines.push(`LOCATION:${escapeText(cell.room)}`);
  lines.push("END:VEVENT");
  return lines;
}

function buildIcs(selfUrl) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI0506//Course Schedule//CN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(CAL_NAME)}`,
    `NAME:${escapeText(CAL_NAME)}`,
    `X-WR-CALDESC:${escapeText("G11 AL 1班 个人课表（临时订阅源）")}`,
    `DESCRIPTION:${escapeText("G11 AL 1班 个人课表（临时订阅源）")}`,
    `X-WR-TIMEZONE:${TZID}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
    "COLOR:cornflowerblue",
    "X-APPLE-CALENDAR-COLOR:#0A84FFFF",
    `SOURCE;VALUE=URI:${selfUrl}`,
    ...VTIMEZONE,
  ];
  LESSONS.forEach((row, pi) => row.forEach((cell, di) => {
    if (cell) lines.push(...eventLines(cell, pi, di));
  }));
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

export function onRequestGet(context) {
  const url = new URL(context.request.url);
  const body = buildIcs(`https://${url.host}/schedule.ics`);
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": "inline; filename=g11-al1-schedule.ics",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

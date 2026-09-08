// iCalendar (RFC 5545) serialization shared by the private subscription feeds.

const encoder = new TextEncoder();

// RFC 7986 §5.9 的 COLOR 只接受 CSS3 颜色关键字，不接受 hex；Apple 的
// X-APPLE-CALENDAR-COLOR 则要 hex。所以同一个颜色要写两遍，各取所需：
// 支持 RFC 7986 的客户端读 COLOR，Apple 日历读 X-APPLE-CALENDAR-COLOR。
// 这里只挑了色相分布够开的一批关键字，够把分类/科目色映射到肉眼接近的名字。
const CSS3_COLOR_NAMES = [
  ["indianred", 205, 92, 92], ["crimson", 220, 20, 60], ["red", 255, 0, 0],
  ["tomato", 255, 99, 71], ["orangered", 255, 69, 0], ["darkorange", 255, 140, 0],
  ["orange", 255, 165, 0], ["goldenrod", 218, 165, 32], ["darkgoldenrod", 184, 134, 11],
  ["gold", 255, 215, 0], ["olive", 128, 128, 0], ["yellowgreen", 154, 205, 50],
  ["olivedrab", 107, 142, 35], ["darkseagreen", 143, 188, 143], ["mediumseagreen", 60, 179, 113],
  ["seagreen", 46, 139, 87], ["green", 0, 128, 0], ["forestgreen", 34, 139, 34],
  ["limegreen", 50, 205, 50], ["lightseagreen", 32, 178, 170], ["teal", 0, 128, 128],
  ["darkcyan", 0, 139, 139], ["cadetblue", 95, 158, 160], ["turquoise", 64, 224, 208],
  ["skyblue", 135, 206, 235], ["lightskyblue", 135, 206, 250], ["deepskyblue", 0, 191, 255],
  ["steelblue", 70, 130, 180], ["cornflowerblue", 100, 149, 237], ["dodgerblue", 30, 144, 255],
  ["royalblue", 65, 105, 225], ["mediumblue", 0, 0, 205], ["slateblue", 106, 90, 205],
  ["mediumslateblue", 123, 104, 238], ["mediumpurple", 147, 112, 219], ["darkorchid", 153, 50, 204],
  ["purple", 128, 0, 128], ["orchid", 218, 112, 214], ["palevioletred", 219, 112, 147],
  ["mediumvioletred", 199, 21, 133], ["hotpink", 255, 105, 180], ["rosybrown", 188, 143, 143],
  ["sienna", 160, 82, 45], ["peru", 205, 133, 63], ["chocolate", 210, 105, 30],
  ["gray", 128, 128, 128], ["dimgray", 105, 105, 105], ["slategray", 112, 128, 144],
  ["lightslategray", 119, 136, 153], ["darkslategray", 47, 79, 79],
];

function parseHex(color) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(color || "").trim());
  if (!match) return null;
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 把 #RRGGBB 映射到最接近的 CSS3 关键字（RFC 7986 的 COLOR 只认关键字）。 */
export function nearestCssColorName(color) {
  const rgb = parseHex(color);
  if (!rgb) return null;
  let best = null;
  let bestDistance = Infinity;
  for (const [name, r, g, b] of CSS3_COLOR_NAMES) {
    const distance = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = name; }
  }
  return best;
}

// Apple 要 8 位 hex（末两位是 alpha）。
function appleColor(color) {
  const rgb = parseHex(color);
  if (!rgb) return null;
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}FF`.toUpperCase();
}

function colorLines(color, { apple = false } = {}) {
  const name = nearestCssColorName(color);
  if (!name) return [];
  const lines = [`COLOR:${name}`];
  if (apple) {
    const hex = appleColor(color);
    if (hex) lines.push(`X-APPLE-CALENDAR-COLOR:${hex}`);
  }
  return lines;
}

export function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function utcDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function nextDate(value) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function eventUid(event) {
  if (event.series_id && event.original_start_time) {
    const occurrence = event.original_start_time.replace(/[^A-Za-z0-9]/g, "");
    return `${event.series_id}-${occurrence}@calendar.ai0506.com`;
  }
  return `${event.id}@calendar.ai0506.com`;
}

// RFC 5545 limits physical content lines to 75 octets. Continuations begin
// with one whitespace octet, so they have 74 bytes left for content.
export function foldLine(line) {
  const parts = [];
  let current = "";
  let length = 0;
  for (const character of line) {
    const characterLength = encoder.encode(character).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (length > 0 && length + characterLength > limit) {
      parts.push(current);
      current = ` ${character}`;
      length = 1 + characterLength;
    } else {
      current += character;
      length += characterLength;
    }
  }
  parts.push(current);
  return parts.join("\r\n");
}

function eventLines(event) {
  const lines = ["BEGIN:VEVENT", `UID:${eventUid(event)}`];
  const stamp = utcDateTime(event.created_at) || utcDateTime(event.updated_at) || utcDateTime(new Date().toISOString());
  lines.push(`DTSTAMP:${stamp}`);
  const lastModified = utcDateTime(event.updated_at);
  if (lastModified) lines.push(`LAST-MODIFIED:${lastModified}`);
  lines.push(...colorLines(event.display_color));

  if (event.all_day) {
    const start = event.start_time.slice(0, 10).replace(/-/g, "");
    const end = nextDate(event.start_time);
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    if (end) lines.push(`DTEND;VALUE=DATE:${end}`);
  } else {
    const start = utcDateTime(event.start_time);
    if (!start) return [];
    lines.push(`DTSTART:${start}`);
    const end = event.end_time ? utcDateTime(event.end_time) : null;
    if (end) lines.push(`DTEND:${end}`);
  }

  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.category) lines.push(`X-AI0506-CATEGORY:${escapeText(event.category)}`);
  if (event.tags?.length) {
    lines.push(`CATEGORIES:${event.tags.map((tag) => escapeText(tag.name)).join(",")}`);
    lines.push(`X-AI0506-TAGS:${event.tags.map((tag) => escapeText(tag.name)).join(",")}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

export function calendarIcs({ name, description, events, color = null }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AI0506//Calendar//CN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeText(name)}`,
    `NAME:${escapeText(name)}`,
  ];
  if (description) lines.push(`X-WR-CALDESC:${escapeText(description)}`, `DESCRIPTION:${escapeText(description)}`);
  // 日历级默认色：订阅进 Apple 日历后这条 feed 的颜色和网页端的分类/科目色一致。
  lines.push(...colorLines(color, { apple: true }));
  for (const event of events) lines.push(...eventLines(event));
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

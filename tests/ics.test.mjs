import assert from "node:assert/strict";
import { calendarIcs, nearestCssColorName } from "../functions/_lib/ics.js";
import { subscriptionUrls } from "../functions/_lib/subscriptions.js";

const ics = calendarIcs({
  name: "AI0506 · Physics",
  description: "Private feed",
  events: [
    {
      id: "one",
      title: "Mechanics; review, notes",
      description: "Line one\nLine two",
      start_time: "2026-08-10T19:00:00+08:00",
      end_time: "2026-08-10T21:00:00+08:00",
      all_day: false,
      category: "Physics",
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-02T00:00:00Z",
      tags: [{ name: "Exam" }, { name: "Revision" }],
    },
    {
      id: "generated-id",
      series_id: "series-1",
      original_start_time: "2026-08-11T00:00:00+08:00",
      title: "All day",
      start_time: "2026-08-11T00:00:00+08:00",
      end_time: "2026-08-11T23:59:00+08:00",
      all_day: true,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-02T00:00:00Z",
      tags: [],
    },
  ],
});

assert.match(ics, /BEGIN:VCALENDAR\r\nVERSION:2.0/);
assert.match(ics, /UID:one@calendar\.ai0506\.com/);
assert.match(ics, /UID:series-1-20260811T0000000800@calendar\.ai0506\.com/);
assert.match(ics, /DTSTART:20260810T110000Z/);
assert.match(ics, /SUMMARY:Mechanics\\; review\\, notes/);
assert.match(ics, /DESCRIPTION:Line one\\nLine two/);
assert.match(ics, /CATEGORIES:Exam,Revision/);
assert.match(ics, /DTSTART;VALUE=DATE:20260811\r\nDTEND;VALUE=DATE:20260812/);
assert.ok(ics.endsWith("END:VCALENDAR\r\n"));

const urls = subscriptionUrls(
  "https://calendar.example.com",
  "private-token",
  [{ id: "cat-physics", name: "Physics", color: "#0891b2" }],
  [{ id: "sub-math", name: "Math", color: "#ff3b30" }],
);
assert.equal(urls.categories[0].url, "https://calendar.example.com/subscribe/private-token/all.ics?category=cat-physics");
assert.equal(urls.subjects[0].url, "https://calendar.example.com/subscribe/private-token/all.ics?subject=sub-math");

// 日历级颜色：RFC 7986 的 COLOR 只接受 CSS3 关键字，Apple 的扩展要 8 位 hex，两个都要写。
assert.equal(nearestCssColorName("#ff3b30"), "tomato");
assert.equal(nearestCssColorName("#32ade6"), "dodgerblue");
assert.equal(nearestCssColorName("#64748b"), "slategray");
assert.equal(nearestCssColorName("default"), null);
assert.equal(nearestCssColorName(null), null);

const colored = calendarIcs({
  name: "AI0506 · Math",
  description: "Math events",
  color: "#ff3b30",
  events: [{
    id: "c1", title: "Paper", start_time: "2026-08-10T19:00:00+08:00", end_time: "2026-08-10T20:00:00+08:00",
    all_day: 0, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z", tags: [],
    display_color: "#30b855",
  }],
});
assert.match(colored, /COLOR:tomato/);
assert.match(colored, /X-APPLE-CALENDAR-COLOR:#FF3B30FF/);
// 单条事件的颜色独立于日历色。
assert.match(colored, /COLOR:mediumseagreen/);

// 没给颜色时一行都不写，不产生空的 COLOR。
const uncolored = calendarIcs({ name: "n", description: "d", events: [] });
assert.ok(!uncolored.includes("COLOR:"));

console.log("ics unit tests passed");

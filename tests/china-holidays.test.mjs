import assert from "node:assert/strict";
import { CHINA_HOLIDAY_DATES_2026, isChinaHoliday } from "../functions/_lib/china-holidays.js";
import { buildIcs } from "../functions/schedule.ics.js";

assert.equal(CHINA_HOLIDAY_DATES_2026.length, 33);
assert.equal(isChinaHoliday("2026-10-01"), true);
assert.equal(isChinaHoliday("2026-10-10"), false); // 调休上班日，不是放假日

const ics = buildIcs("https://calendar.example.com/schedule.ics");
assert.match(ics, /EXDATE;TZID=Asia\/Shanghai:20260925T080000/);
assert.match(ics, /EXDATE;TZID=Asia\/Shanghai:20261001T080000/);
assert.match(ics, /EXDATE;TZID=Asia\/Shanghai:20261005T080000/);
assert.doesNotMatch(ics, /20261010/);

console.log("china holiday course suppression tests passed");

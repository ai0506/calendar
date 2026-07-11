import assert from "node:assert/strict";
import { mergeSeriesPatch, seriesRowToRequest } from "../functions/_lib/recurrence.js";

globalThis.crypto ??= { randomUUID: () => "00000000-0000-4000-8000-000000000000" };

const stored = {
  title: "Research office hour",
  description: "Keep this description",
  category: "Research",
  color: "#7c3aed",
  group_title: "Lab",
  all_day: 0,
  start_time: "2026-07-13T10:00:00+08:00",
  end_time: "2026-07-13T11:00:00+08:00",
  frequency: "weekly",
  interval: 1,
  weekdays: JSON.stringify([1]),
  monthly_mode: null,
  monthly_day: null,
  start_date: "2026-07-13",
  end_date: "2026-08-31",
  occurrence_count: null,
};

const titleOnly = mergeSeriesPatch(stored, { title: "Office Hour (Opt)" }, [
  "title", "description", "category", "color", "group_title", "all_day",
  "start_time", "end_time", "frequency", "weekdays", "start_date", "end_date", "occurrence_count",
]);
assert.equal(titleOnly.title, "Office Hour (Opt)");
assert.equal(titleOnly.category, "Research");
assert.equal(titleOnly.color, "#7c3aed");
assert.deepEqual(titleOnly.weekdays, [1]);

const cleared = mergeSeriesPatch(stored, { description: null, category: null }, ["description", "category"]);
assert.equal(cleared.description, null);
assert.equal(cleared.category, null);

const malformedWeekdays = seriesRowToRequest({ ...stored, weekdays: "not-json" });
assert.equal(malformedWeekdays.weekdays, null);

console.log("series patch regression tests passed");

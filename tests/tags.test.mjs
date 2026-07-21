import assert from "node:assert/strict";
import { MAX_TAGS_PER_ITEM, validateSuggestionTagIds, validateTagIds } from "../functions/_lib/tags.js";

assert.equal(validateTagIds([]), null);
assert.equal(validateTagIds(["tag-exam", "tag-revision"]), null);
assert.match(validateTagIds(["tag-exam", "tag-exam"]), /duplicates/);
assert.match(validateTagIds(["", "tag-exam"]), /non-empty/);
assert.match(validateTagIds(Array.from({ length: MAX_TAGS_PER_ITEM + 1 }, (_, index) => `tag-${index}`)), /at most/);
assert.equal(validateSuggestionTagIds(Array.from({ length: 6 }, (_, index) => `tag-${index}`)), null);
assert.match(validateSuggestionTagIds(["tag-exam", "tag-exam"]), /duplicates/);

console.log("tag unit tests passed");

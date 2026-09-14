import assert from "node:assert/strict";
import { DEFAULT_SCOPE, READ_SCOPE, normalizeScope, scopePermits } from "../functions/_lib/oauth.js";
import { toolAllowedForScope } from "../functions/mcp/index.js";

assert.equal(normalizeScope(DEFAULT_SCOPE), DEFAULT_SCOPE);
assert.equal(normalizeScope(READ_SCOPE), READ_SCOPE);
assert.equal(normalizeScope("calendar calendar.read"), DEFAULT_SCOPE);
assert.equal(normalizeScope("calendar.read calendar.read"), READ_SCOPE);
assert.equal(normalizeScope("calendar.write"), null);
assert.equal(normalizeScope("calendar calendar.write"), null);
assert.equal(scopePermits(READ_SCOPE, READ_SCOPE), true);
assert.equal(scopePermits(DEFAULT_SCOPE, READ_SCOPE), false);
assert.equal(scopePermits(READ_SCOPE, DEFAULT_SCOPE), true);
assert.equal(toolAllowedForScope(READ_SCOPE, "calendar_list_events"), true);
assert.equal(toolAllowedForScope(READ_SCOPE, "calendar_create_event"), false);
assert.equal(toolAllowedForScope(DEFAULT_SCOPE, "calendar_create_event"), true);
console.log("OAuth scope unit tests passed");

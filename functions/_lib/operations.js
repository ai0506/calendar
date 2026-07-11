import { queryOne } from "./db.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getIdempotencyKey(request) {
  const value = request.headers.get("Idempotency-Key");
  return value && UUID_RE.test(value) ? value : null;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = stableValue(value[key]);
      return out;
    }, {});
  }
  return value;
}

export async function hashRequest(value) {
  const encoded = new TextEncoder().encode(JSON.stringify(stableValue(value)));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getOperation(env, key) {
  return queryOne(
    env.DB,
    "SELECT * FROM event_operations WHERE idempotency_key = ?",
    [key],
  );
}

export function isUniqueConflict(err) {
  return /UNIQUE constraint failed|PRIMARY KEY|idempotency_key/i.test(String(err?.message || err));
}

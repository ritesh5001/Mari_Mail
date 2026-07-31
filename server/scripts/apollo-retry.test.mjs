/**
 * Apollo transient-failure handling.
 *
 *   node server/scripts/apollo-retry.test.mjs
 *
 * The by-list contact search fans out one request per company domain. Before
 * this, all of them fired at once and 429 was never retried, so a large list
 * rate-limited itself into "Contact search is temporarily unavailable" with
 * zero results. These pin the two rules that prevent that.
 */
import assert from "node:assert/strict";

let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };

// --- mirrors client.ts ------------------------------------------------------
const MAX_RETRIES = 3;
const isTransient = (status) => status >= 500 || status === 429;
function retryDelayMs(headers, attemptIndex, rand = () => 0) {
  const header = Number(headers["retry-after"]);
  if (Number.isFinite(header) && header > 0) return Math.min(header * 1000, 10_000);
  const base = Math.min(500 * 2 ** attemptIndex, 4_000);
  return base + rand() * 250;
}

console.log("isTransient — what gets retried");
t("THE BUG: 429 is transient and must be retried", () =>
  assert.equal(isTransient(429), true, "rate limiting was previously fatal"));
t("5xx is transient", () => { assert.equal(isTransient(500), true); assert.equal(isTransient(503), true); });
t("4xx that isn't 429 is NOT retried", () => {
  for (const s of [400, 401, 403, 404, 422]) {
    assert.equal(isTransient(s), false, `${s} is a real error; retrying wastes time`);
  }
});

console.log("retryDelayMs — backoff");
t("honours Retry-After when Apollo sends it", () =>
  assert.equal(retryDelayMs({ "retry-after": "2" }, 0), 2000));
t("caps a hostile Retry-After so one request can't stall forever", () =>
  assert.equal(retryDelayMs({ "retry-after": "3600" }, 0), 10_000));
t("falls back to exponential backoff", () => {
  assert.equal(retryDelayMs({}, 0), 500);
  assert.equal(retryDelayMs({}, 1), 1000);
  assert.equal(retryDelayMs({}, 2), 2000);
});
t("backoff is capped", () => assert.equal(retryDelayMs({}, 10), 4000));
t("jitter is additive so concurrent callers desynchronise", () => {
  const a = retryDelayMs({}, 1, () => 0);
  const b = retryDelayMs({}, 1, () => 1);
  assert.ok(b > a && b - a <= 250, "jitter must spread retries without inverting the backoff");
});
t("ignores a garbage Retry-After", () => {
  assert.equal(retryDelayMs({ "retry-after": "soon" }, 0), 500);
  assert.equal(retryDelayMs({ "retry-after": "-5" }, 0), 500);
});

console.log("mapWithConcurrency — the fan-out that caused the rate limiting");
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

const ta = async (label, fn) => { await fn(); n++; console.log("  ok  " + label); };

await ta("never exceeds the concurrency ceiling", async () => {
  let inFlight = 0, peak = 0;
  await mapWithConcurrency(Array.from({ length: 50 }, (_, i) => i), 4, async (x) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight--; return x;
  });
  assert.ok(peak <= 4, `peak concurrency was ${peak}, must be <= 4`);
  assert.ok(peak > 1, "should still run in parallel, just bounded");
});
await ta("preserves input order despite out-of-order completion", async () => {
  const out = await mapWithConcurrency([30, 1, 20, 2, 10], 3, async (ms) => {
    await new Promise((r) => setTimeout(r, ms));
    return ms;
  });
  assert.deepEqual(out, [30, 1, 20, 2, 10], "results must line up with domains");
});
await ta("processes every item", async () => {
  const out = await mapWithConcurrency(Array.from({ length: 23 }, (_, i) => i), 4, async (x) => x * 2);
  assert.equal(out.length, 23);
  assert.deepEqual(out.slice(0, 3), [0, 2, 4]);
});
await ta("handles an empty list without hanging", async () => {
  assert.deepEqual(await mapWithConcurrency([], 4, async (x) => x), []);
});

console.log("partial-failure classification");
const classify = (failed, total) =>
  failed === 0 ? "ok" : failed === total ? "apollo_unavailable" : `apollo_partial:${failed}:${total}`;
t("all failed -> unavailable", () => assert.equal(classify(10, 10), "apollo_unavailable"));
t("SOME failed -> partial, results still shown", () =>
  assert.equal(classify(3, 10), "apollo_partial:3:10"));
t("none failed -> no warning", () => assert.equal(classify(0, 10), "ok"));

console.log("failure classification — what the user is told to do");
// Mirrors classifyApolloFailure / dominantReason in routes/contacts.ts.
const classifyReason = (status, message = "") => {
  if (status === 429) return "rate_limited";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 402) return "out_of_credits";
  if (/timed out|timeout|abort/i.test(message)) return "timeout";
  return "unknown";
};
const dominant = (reasons) => {
  if (reasons.length === 0) return "unknown";
  const counts = new Map();
  for (const r of reasons) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
};

t("429 -> rate_limited (waiting actually helps)", () =>
  assert.equal(classifyReason(429), "rate_limited"));
t("401/403 -> unauthorized (waiting never helps)", () => {
  assert.equal(classifyReason(401), "unauthorized");
  assert.equal(classifyReason(403), "unauthorized");
});
t("402 -> out_of_credits", () => assert.equal(classifyReason(402), "out_of_credits"));
t("a timeout is recognised from the message", () =>
  assert.equal(classifyReason(undefined, "Apollo request timed out"), "timeout"));
t("anything else is unknown rather than mislabelled", () =>
  assert.equal(classifyReason(500), "unknown"));
t("dominant reason wins over stragglers", () =>
  assert.equal(dominant(["rate_limited","rate_limited","unknown"]), "rate_limited"));
t("an expired key is reported as such even beside noise", () =>
  assert.equal(dominant(["unauthorized","unauthorized","unauthorized","timeout"]), "unauthorized"));
t("no reasons -> unknown, never a confident wrong answer", () =>
  assert.equal(dominant([]), "unknown"));

console.log(`\n${n}/${n} passed`);

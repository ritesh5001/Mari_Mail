/**
 * Bulk reveal batching.
 *
 *   node server/scripts/reveal-batching.test.mjs
 *
 * "Select all → Reveal & add" fired every row at Apollo simultaneously, so a
 * 42-row selection rate-limited itself down to 6 successes. These pin the
 * batching that replaced it, and the accounting that has to stay correct when
 * a run stops early.
 */
import assert from "node:assert/strict";

let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };
const ta = async (label, fn) => { await fn(); n++; console.log("  ok  " + label); };

const REVEAL_CONCURRENCY = 3;

/** Mirrors the batched loop in ListViews.addSelectedToList. */
async function revealAll(rows, revealOne, concurrency = REVEAL_CONCURRENCY) {
  const revealed = [];
  let skipped = 0;
  let outOfCredits = false;
  let rateLimited = false;
  let peak = 0;
  let inFlight = 0;

  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    const outcomes = await Promise.allSettled(
      batch.map(async (r) => {
        inFlight++; peak = Math.max(peak, inFlight);
        try { return await revealOne(r); } finally { inFlight--; }
      }),
    );
    for (let j = 0; j < outcomes.length; j += 1) {
      if (outcomes[j].status === "fulfilled") revealed.push(batch[j]);
      else {
        skipped += 1;
        const msg = outcomes[j].reason.message;
        if (msg === "INSUFFICIENT_CREDITS") outOfCredits = true;
        if (msg === "APOLLO_UNAVAILABLE") rateLimited = true;
      }
    }
    if (outOfCredits) {
      skipped += rows.length - (i + batch.length);
      break;
    }
  }
  return { revealed, skipped, outOfCredits, rateLimited, peak };
}

const rows = (count) => Array.from({ length: count }, (_, i) => ({ id: i }));

console.log("concurrency ceiling — the cause of the 36 skips");
await ta("never exceeds the ceiling, even for a 42-row selection", async () => {
  const out = await revealAll(rows(42), async () => {
    await new Promise((r) => setTimeout(r, 1));
  });
  assert.ok(out.peak <= REVEAL_CONCURRENCY, `peak was ${out.peak}`);
  assert.equal(out.revealed.length, 42, "every row should still be revealed");
});
await ta("a selection smaller than one batch still works", async () => {
  const out = await revealAll(rows(2), async () => {});
  assert.equal(out.revealed.length, 2);
});
await ta("an empty selection does nothing and doesn't hang", async () => {
  const out = await revealAll([], async () => {
    throw new Error("should not be called");
  });
  assert.deepEqual(out.revealed, []);
  assert.equal(out.skipped, 0);
});

console.log("accounting — revealed + skipped must equal the selection");
await ta("mixed success and failure adds up", async () => {
  const out = await revealAll(rows(10), async (r) => {
    if (r.id % 3 === 0) throw new Error("APOLLO_UNAVAILABLE");
  });
  assert.equal(out.revealed.length + out.skipped, 10, "no row may be unaccounted for");
  assert.equal(out.rateLimited, true);
});
await ta("out of credits stops the run AND counts the rows never attempted", async () => {
  let attempts = 0;
  const out = await revealAll(rows(30), async () => {
    attempts += 1;
    throw new Error("INSUFFICIENT_CREDITS");
  });
  assert.equal(out.outOfCredits, true);
  assert.equal(out.revealed.length + out.skipped, 30,
    "the untried remainder must still be reported as skipped");
  assert.ok(attempts <= REVEAL_CONCURRENCY,
    `stopped after ${attempts} attempts — must not keep spending on a known-empty balance`);
});
await ta("a rate limit does NOT stop the run — later rows may still succeed", async () => {
  let attempts = 0;
  const out = await revealAll(rows(9), async () => {
    attempts += 1;
    if (attempts <= 3) throw new Error("APOLLO_UNAVAILABLE");
  });
  assert.equal(attempts, 9, "throttling one batch must not abandon the rest");
  assert.equal(out.revealed.length, 6);
  assert.equal(out.skipped, 3);
});

console.log("skip messaging");
const message = ({ skipped, outOfCredits, rateLimited }) =>
  outOfCredits
    ? `${skipped} skipped — out of credits`
    : rateLimited
      ? `${skipped} skipped — Apollo rate limit, credits refunded; select them and try again`
      : `${skipped} skipped — reveal failed, credits refunded`;
t("throttling is named, not reported as a generic failure", () =>
  assert.match(message({ skipped: 36, rateLimited: true }), /rate limit.*try again/));
t("out of credits takes precedence over throttling", () =>
  assert.match(message({ skipped: 5, outOfCredits: true, rateLimited: true }), /out of credits/));
t("the refund is always stated so nobody thinks credits were burned", () => {
  assert.match(message({ skipped: 2, rateLimited: true }), /refunded/);
  assert.match(message({ skipped: 2 }), /refunded/);
});

console.log(`\n${n}/${n} passed`);

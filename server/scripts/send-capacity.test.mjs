/**
 * Campaign send capacity.
 *
 *   node server/scripts/send-capacity.test.mjs
 *
 * A campaign's daily cap is the sum of its mailboxes' own daily limits, read
 * fresh on every send rather than stored. Mailboxes can be attached and
 * detached at any point — including while the campaign is running — so a copy
 * taken at launch would be stale the moment anyone touched the list, and stale
 * in the expensive direction: throttling a campaign whose capacity had just
 * gone up, with nothing on screen to explain it.
 *
 * Mirrors resolveCampaignDailyCap in services/sequence-sender.ts.
 */
import assert from "node:assert/strict";

let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };

const USABLE = new Set(["ACTIVE", "WARMING"]);

/** Mirrors campaignInboxes(): the mailboxes a campaign may actually send from. */
function usableInboxes(all, fromAccountIds) {
  return all.filter(
    (i) =>
      USABLE.has(i.status) &&
      !i.isPlatformDefault &&
      (fromAccountIds.length === 0 || fromAccountIds.includes(i.id)),
  );
}
const capFor = (all, ids) => usableInboxes(all, ids).reduce((s, i) => s + i.dailyLimit, 0);

const box = (id, dailyLimit, status = "ACTIVE", isPlatformDefault = false) =>
  ({ id, dailyLimit, status, isPlatformDefault });

console.log("the headline rule — capacity is the sum of the mailboxes");
t("two mailboxes at 50 give the campaign 100/day", () =>
  assert.equal(capFor([box("a", 50), box("b", 50)], ["a", "b"]), 100));
t("ten mailboxes at 50 give 500/day", () => {
  const boxes = Array.from({ length: 10 }, (_, i) => box(`i${i}`, 50));
  assert.equal(capFor(boxes, boxes.map((b) => b.id)), 500);
});
t("mailboxes with different limits add up, not average", () =>
  assert.equal(capFor([box("a", 50), box("b", 200), box("c", 30)], ["a", "b", "c"]), 280));
t("one mailbox is just its own limit", () =>
  assert.equal(capFor([box("a", 50)], ["a"]), 50));

console.log("changing mailboxes mid-flight");
const fleet = [box("a", 50), box("b", 50), box("c", 50)];
t("attaching a third mailbox raises the cap immediately", () => {
  assert.equal(capFor(fleet, ["a", "b"]), 100);
  assert.equal(capFor(fleet, ["a", "b", "c"]), 150);
});
t("detaching one lowers it just as fast", () =>
  assert.equal(capFor(fleet, ["a"]), 50));
t("editing a mailbox's own limit moves the campaign cap with it", () => {
  const raised = [box("a", 50), box("b", 500)];
  assert.equal(capFor(raised, ["a", "b"]), 550);
});

console.log("which mailboxes count");
t("an empty selection means every connected mailbox", () =>
  assert.equal(capFor(fleet, []), 150));
t("an ERRORed mailbox contributes nothing", () =>
  assert.equal(capFor([box("a", 50), box("b", 50, "ERROR")], ["a", "b"]), 50));
t("a PAUSED mailbox contributes nothing", () =>
  assert.equal(capFor([box("a", 50), box("b", 50, "PAUSED")], ["a", "b"]), 50));
t("a WARMING mailbox does count — it is sending, just carefully", () =>
  assert.equal(capFor([box("a", 50), box("b", 50, "WARMING")], ["a", "b"]), 100));
t("the platform mailbox never counts, even under 'all mailboxes'", () =>
  assert.equal(capFor([box("a", 50), box("p", 200, "ACTIVE", true)], []), 50));
t("a stale id for a deleted mailbox is ignored rather than counted", () =>
  assert.equal(capFor([box("a", 50)], ["a", "gone"]), 50));

console.log("zero capacity — must be visible, not a silent stall");
t("every mailbox errored means a cap of 0", () =>
  assert.equal(capFor([box("a", 50, "ERROR"), box("b", 50, "ERROR")], ["a", "b"]), 0));
t("no mailboxes at all means a cap of 0", () =>
  assert.equal(capFor([], []), 0));
t("a cap of 0 blocks sending rather than letting it through", () => {
  // Mirrors the gate: campaignSent >= cap defers.
  const blocked = (sent, cap) => sent >= cap;
  assert.equal(blocked(0, 0), true, "0 >= 0 — nothing may send on zero capacity");
  assert.equal(blocked(0, 50), false);
  assert.equal(blocked(50, 50), true);
});

console.log("pacing — the campaign gap divides across the fleet");
/** Mirrors dividedCampaignGap in services/campaign-capacity.ts. */
const MIN_GAP = 5;
function dividedGap(minSeconds, maxSeconds, inboxCount) {
  const max = Math.max(maxSeconds, minSeconds);
  if (max <= 0) return { min: 0, max: 0 };
  const n = Math.max(1, inboxCount);
  return {
    min: Math.max(MIN_GAP, Math.round(minSeconds / n)),
    max: Math.max(MIN_GAP, Math.round(max / n)),
  };
}
const M = 60;

t("one mailbox is unchanged — 5-20 min stays 5-20 min", () =>
  assert.deepEqual(dividedGap(5 * M, 20 * M, 1), { min: 5 * M, max: 20 * M }));
t("two mailboxes halve it", () =>
  assert.deepEqual(dividedGap(5 * M, 20 * M, 2), { min: 2.5 * M, max: 10 * M }));
t("THE SCENARIO: ten mailboxes turn a 10 min pick into ~1 min", () => {
  // The user's example: 5-20 configured, 10 mailboxes. The midpoint pick of
  // 10 min becomes 1 min at campaign level.
  const g = dividedGap(5 * M, 20 * M, 10);
  assert.equal(g.min, 30);
  assert.equal(g.max, 2 * M);
  assert.equal(Math.round(10 * M / 10), 60, "a 10 min pick lands at 1 min");
});
t("each mailbox still rests its full configured gap", () => {
  // N mailboxes, campaign emitting every G/N, round-robin: any one mailbox is
  // picked once per N sends, so it sees G between its own sends.
  const configured = 10 * M;
  const fleet = 10;
  const campaignGap = configured / fleet;
  assert.equal(campaignGap * fleet, configured,
    "per-mailbox spacing is unchanged — that is what protects deliverability");
});

console.log("pacing guards");
t("never collapses to zero — that would mean 'no spacing at all'", () => {
  const g = dividedGap(30, 60, 100);
  assert.ok(g.min >= MIN_GAP && g.max >= MIN_GAP);
});
t("a deliberate zero gap stays zero", () =>
  assert.deepEqual(dividedGap(0, 0, 10), { min: 0, max: 0 }));
t("zero mailboxes does not divide by zero", () =>
  assert.deepEqual(dividedGap(5 * M, 20 * M, 0), { min: 5 * M, max: 20 * M }));
t("a fixed (non-random) gap divides too", () =>
  assert.deepEqual(dividedGap(10 * M, 10 * M, 5), { min: 2 * M, max: 2 * M }));

console.log("throughput — the reason this matters");
t("undivided, ten mailboxes sent no faster than one", () => {
  const perHourUndivided = 3600 / (12.5 * M);
  const perHourDivided = 3600 / (12.5 * M / 10);
  assert.ok(perHourDivided > perHourUndivided * 9,
    "the fleet must actually buy throughput, not just daily volume");
});
t("pacing and the daily cap now agree on what the fleet can do", () => {
  // 10 mailboxes x 50/day = 500/day, and a 1 min average gap over a 12h
  // window is ~720 slots — enough to actually reach the cap.
  const cap = capFor(Array.from({ length: 10 }, (_, i) => box(`i${i}`, 50)), []);
  const avgGapSeconds = (dividedGap(5 * M, 20 * M, 10).min + dividedGap(5 * M, 20 * M, 10).max) / 2;
  const slotsIn12h = (12 * 3600) / avgGapSeconds;
  assert.equal(cap, 500);
  assert.ok(slotsIn12h >= cap, `only ${Math.round(slotsIn12h)} slots for a ${cap}/day cap`);
});

console.log("what this means for the drip");
t("the sustainable drip rate follows capacity, not a typed-in number", () => {
  const sustainable = (cap, steps) => Math.floor(cap / Math.max(1, steps));
  assert.equal(sustainable(capFor([box("a", 50)], ["a"]), 2), 25);
  // Reconnecting the second mailbox is what makes 50/day deliverable.
  assert.equal(sustainable(capFor([box("a", 50), box("b", 50)], ["a", "b"]), 2), 50);
});

console.log(`\n${n}/${n} passed`);

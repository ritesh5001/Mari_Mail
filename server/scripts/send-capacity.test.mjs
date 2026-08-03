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

console.log("what this means for the drip");
t("the sustainable drip rate follows capacity, not a typed-in number", () => {
  const sustainable = (cap, steps) => Math.floor(cap / Math.max(1, steps));
  assert.equal(sustainable(capFor([box("a", 50)], ["a"]), 2), 25);
  // Reconnecting the second mailbox is what makes 50/day deliverable.
  assert.equal(sustainable(capFor([box("a", 50), box("b", 50)], ["a", "b"]), 2), 50);
});

console.log(`\n${n}/${n} passed`);

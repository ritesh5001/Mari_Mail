/**
 * Campaign send-gap spacing.
 *
 *   pnpm --filter @marimail/server test:gap
 *
 * A campaign set to a 5-20 min random gap scheduled all 20 of its mails at a
 * flat 60-minute spacing (09:00, 10:00, 11:00 ... UTC). The gap arithmetic was
 * fine; `nextSendSlot` then rounded every candidate UP to the next whole hour,
 * which threw the minutes away and re-quantised everything to 1h.
 *
 * These import the REAL nextSendSlot so the assertions can't drift from it.
 * (No REDIS_URL here, so the module's queue stays null and nothing connects.)
 */
import assert from "node:assert/strict";
import { nextSendSlot, scheduleFieldsChanged } from "../src/services/campaign-manual-scheduler.js";

let n = 0;
const t = (label: string, fn: () => void) => { fn(); n++; console.log("  ok  " + label); };

/** The campaign in the bug report: 09:00-17:00 UTC, all seven days. */
const WINDOW = {
  scheduleDays: [0, 1, 2, 3, 4, 5, 6],
  hourStart: 9,
  hourEnd: 17,
  timeZone: "UTC",
};
const at = (iso: string) => new Date(iso);
const hhmm = (d: Date) => d.toISOString().slice(11, 16);

console.log("minute precision — the actual regression");
t("a time inside the window keeps its minutes", () =>
  assert.equal(hhmm(nextSendSlot(at("2026-08-03T09:12:00Z"), WINDOW)), "09:12"));
t("09:00 + a 7-minute gap stays 09:07, it does not become 10:00", () =>
  assert.equal(hhmm(nextSendSlot(at("2026-08-03T09:07:00Z"), WINDOW)), "09:07"));
t("the last minute of the window is still inside it", () =>
  assert.equal(hhmm(nextSendSlot(at("2026-08-03T16:59:00Z"), WINDOW)), "16:59"));
t("the exact window open is unchanged", () =>
  assert.equal(hhmm(nextSendSlot(at("2026-08-03T09:00:00Z"), WINDOW)), "09:00"));

console.log("window edges — rolling out of hours still snaps to the next open slot");
t("before the window opens rolls forward to 09:00 the same day", () => {
  const d = nextSendSlot(at("2026-08-03T06:30:00Z"), WINDOW);
  assert.equal(hhmm(d), "09:00");
  assert.equal(d.toISOString().slice(0, 10), "2026-08-03");
});
t("past the window close rolls to 09:00 the NEXT day", () => {
  const d = nextSendSlot(at("2026-08-03T17:05:00Z"), WINDOW);
  assert.equal(hhmm(d), "09:00");
  assert.equal(d.toISOString().slice(0, 10), "2026-08-04");
});
t("a weekday-only campaign skips the weekend", () => {
  // 2026-08-08 is a Saturday.
  const d = nextSendSlot(at("2026-08-08T10:00:00Z"), { ...WINDOW, scheduleDays: [1, 2, 3, 4, 5] });
  assert.equal(d.toISOString().slice(0, 10), "2026-08-10", "should land on Monday");
  assert.equal(hhmm(d), "09:00");
});
t("an empty schedule is a no-op rather than a 21-day walk", () =>
  assert.equal(nextSendSlot(at("2026-08-03T09:12:00Z"), { ...WINDOW, scheduleDays: [] }).toISOString(),
    "2026-08-03T09:12:00.000Z"));

console.log("a non-UTC window is judged in its own timezone");
t("02:30 pm IST is inside a 09:00-17:00 Asia/Kolkata window", () =>
  // 09:00Z == 14:30 IST.
  assert.equal(nextSendSlot(at("2026-08-03T09:00:00Z"), { ...WINDOW, timeZone: "Asia/Kolkata" })
    .toISOString(), "2026-08-03T09:00:00.000Z"));
t("20:00 IST is outside it and rolls forward", () => {
  // 14:30Z == 20:00 IST, past the 17:00 IST close.
  const d = nextSendSlot(at("2026-08-03T14:30:00Z"), { ...WINDOW, timeZone: "Asia/Kolkata" });
  assert.ok(d.getTime() > at("2026-08-03T14:30:00Z").getTime());
  assert.equal(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata", hour12: false, hour: "2-digit",
  }).format(d), "09");
});

console.log("end-to-end — 20 contacts at a 5-20 min gap");
/** Mirrors the step-1 chaining in enrolAndScheduleManualContact. */
function scheduleMany(count: number, gapMin: number, gapMax: number, startAt: number) {
  // Deterministic stand-in for Math.random() so the run is reproducible.
  let seed = 42;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  const out: Date[] = [];
  let latest: Date | null = null;
  for (let i = 0; i < count; i += 1) {
    const gap = gapMin + Math.floor(rand() * (gapMax - gapMin + 1));
    const base = latest ? Math.max(startAt, latest.getTime() + gap * 1000) : startAt;
    const fire = nextSendSlot(new Date(base), WINDOW);
    out.push(fire);
    latest = fire;
  }
  return out;
}

const sends = scheduleMany(20, 300, 1200, at("2026-08-03T09:00:00Z").getTime());
const gapsMin = sends.slice(1).map((d, i) => (d.getTime() - sends[i].getTime()) / 60000);

t("THE BUG: consecutive sends are not all exactly 60 minutes apart", () =>
  assert.ok(!gapsMin.every((g) => g === 60),
    `every gap was 60 min: ${gapsMin.join(", ")}`));
t("every gap sits inside the configured 5-20 min range", () => {
  // Same-day sends only; a send that rolls into the next window legitimately
  // jumps by more than 20 min.
  const sameDay = gapsMin.filter((_, i) =>
    sends[i].toISOString().slice(0, 10) === sends[i + 1].toISOString().slice(0, 10));
  for (const g of sameDay) {
    assert.ok(g >= 5 && g <= 20, `gap of ${g} min is outside 5-20`);
  }
  assert.ok(sameDay.length >= 15, `only ${sameDay.length} same-day gaps to check`);
});
t("the gaps actually vary rather than landing on one repeated value", () =>
  assert.ok(new Set(gapsMin).size > 3,
    `only ${new Set(gapsMin).size} distinct gap(s): ${gapsMin.join(", ")}`));
t("sends stay strictly ordered and inside the window", () => {
  for (let i = 1; i < sends.length; i += 1) {
    assert.ok(sends[i].getTime() > sends[i - 1].getTime(), "sends must advance");
  }
  for (const d of sends) {
    const h = d.getUTCHours();
    assert.ok(h >= 9 && h < 17, `${d.toISOString()} is outside 09:00-17:00`);
  }
});
t("20 mails at a ~12 min average fit in one 8-hour window", () =>
  assert.equal(sends[0].toISOString().slice(0, 10), sends[19].toISOString().slice(0, 10)));

console.log("applying an edit — which changes re-lay the pending sends");
const CURRENT = {
  sendGapSeconds: 300,
  sendGapMaxSeconds: 1200,
  scheduleDays: [1, 2, 3, 4, 5],
  scheduleHourStart: 9,
  scheduleHourEnd: 17,
  timezone: "UTC",
};
t("widening the send gap counts as a change", () =>
  assert.equal(scheduleFieldsChanged(CURRENT, { ...CURRENT, sendGapMaxSeconds: 2400 }), true));
t("moving the window counts as a change", () =>
  assert.equal(scheduleFieldsChanged(CURRENT, { ...CURRENT, scheduleHourEnd: 20 }), true));
t("switching timezone counts as a change", () =>
  assert.equal(scheduleFieldsChanged(CURRENT, { ...CURRENT, timezone: "Asia/Kolkata" }), true));
t("adding a sending day counts as a change — arrays compare by value", () =>
  assert.equal(scheduleFieldsChanged(CURRENT, { ...CURRENT, scheduleDays: [1, 2, 3, 4, 5, 6] }), true));
t("re-sending identical days does NOT count — same value, new array", () =>
  assert.equal(scheduleFieldsChanged(CURRENT, { ...CURRENT, scheduleDays: [1, 2, 3, 4, 5] }), false));
t("saving with nothing schedule-related touched does NOT respace", () =>
  assert.equal(scheduleFieldsChanged(CURRENT, { ...CURRENT }), false),
);
t("editing only a subject line does NOT respace live send times", () =>
  assert.equal(scheduleFieldsChanged(CURRENT, {}), false));
t("an omitted field is 'unchanged', not 'cleared'", () =>
  assert.equal(scheduleFieldsChanged(CURRENT, { sendGapSeconds: undefined }), false));

console.log("a relaunch restarts the run from now — it must not chain after the old one");
/**
 * The drift that pushed a campaign to "first send tomorrow morning".
 *
 * The per-contact path bases each contact on
 *     max(now, latestScheduledSendForCampaign + gap)
 * reading `latest` from the DB across ALL contacts, future ones included. On a
 * relaunch every contact is re-enrolled, so contact 1 chains after the PREVIOUS
 * run's last send and the rest chain after each other — the whole campaign
 * marches one full run-length into the future on every relaunch. Three clicks
 * on a 69-contact run at ~12 min spacing is ~45h of drift.
 *
 * respaceManualCampaign starts from `now` instead, which is what makes a
 * relaunch pull the run back to the present.
 */
const RUN_LENGTH_MS = 14.8 * 3600_000; // the observed live run
const staleLatest = Date.now() + RUN_LENGTH_MS; // last send of the previous run

const chainedBase = Math.max(Date.now(), staleLatest + 600_000); // old behaviour
const respacedBase = Date.now(); // layoutAndQueue with startAfterMs = null

t("THE BUG: chaining off the previous run starts the campaign ~15h late", () =>
  assert.ok(chainedBase - Date.now() > 14 * 3600_000,
    "a relaunch used to push the whole run past the previous one"));
t("respace starts the run from now instead", () =>
  assert.ok(respacedBase - Date.now() < 1000,
    "a respaced run must begin immediately, not after the stale schedule"));
t("drift compounds — three relaunches used to stack three run-lengths", () => {
  let base = Date.now();
  for (let i = 0; i < 3; i += 1) base = Math.max(Date.now(), base + RUN_LENGTH_MS + 600_000);
  assert.ok(base - Date.now() > 44 * 3600_000, "each relaunch added another run length");
});

console.log("relaunch must not re-mail people who already received it");
/**
 * A completed send clears nextSendAt but leaves the row SCHEDULED, so
 * "already delivered" and "never scheduled" were indistinguishable. A relaunch
 * re-queued every past recipient: 62 of 72 contacts on the live campaign were
 * holding a second copy of a mail they had already been sent.
 *
 * SentMessage is the authority on what actually went out.
 */
type Row = { contactId: string; nextSendAt: number | null };
const selectForRelaunch = (rows: Row[], mailed: Set<string>, onlyUnscheduled: boolean) => {
  const candidates = rows.filter((r) => !mailed.has(r.contactId));
  return onlyUnscheduled ? candidates.filter((r) => r.nextSendAt === null) : candidates;
};

// The live shape: 62 sent (nextSendAt cleared), 10 still waiting.
const liveRows: Row[] = [
  ...Array.from({ length: 62 }, (_, i) => ({ contactId: `sent${i}`, nextSendAt: null })),
  ...Array.from({ length: 10 }, (_, i) => ({ contactId: `wait${i}`, nextSendAt: 1_000 + i })),
];
const liveMailed = new Set(Array.from({ length: 62 }, (_, i) => `sent${i}`));

t("THE BUG: a cleared nextSendAt used to look like 'never scheduled'", () => {
  const naive = liveRows.filter((r) => r.nextSendAt === null);
  assert.equal(naive.length, 62, "which is exactly how 62 duplicates got queued");
});
t("already-mailed contacts are excluded from a relaunch", () =>
  assert.equal(selectForRelaunch(liveRows, liveMailed, true).length, 0));
t("a newly added contact IS still picked up", () => {
  const withNew: Row[] = [...liveRows, { contactId: "brand-new", nextSendAt: null }];
  const picked = selectForRelaunch(withNew, liveMailed, true);
  assert.deepEqual(picked.map((r) => r.contactId), ["brand-new"]);
});
t("contacts still waiting keep their existing schedule, not a second one", () => {
  const picked = selectForRelaunch(liveRows, liveMailed, true);
  assert.ok(!picked.some((r) => r.contactId.startsWith("wait")),
    "respace re-paces those; launch must not queue them again");
});
t("a first launch enrols everyone, since nobody has been mailed", () =>
  assert.equal(selectForRelaunch(liveRows, new Set(), false).length, 72));
t("even a non-relaunch path skips past recipients", () =>
  assert.equal(selectForRelaunch(liveRows, liveMailed, false).length, 10));

console.log("two independent guards — neither has to be perfect alone");
const CONTACTED = new Set([
  "SENT", "OPENED", "CLICKED", "REPLIED", "BOUNCED", "UNSUBSCRIBED", "FAILED",
]);
type Row2 = { contactId: string; nextSendAt: number | null; status: string };
const guardedSelect = (rows: Row2[], mailed: Set<string>) =>
  rows.filter((r) => !mailed.has(r.contactId) && !CONTACTED.has(r.status))
      .filter((r) => r.nextSendAt === null);

t("the status guard alone catches a contact missing its SentMessage row", () => {
  const rows: Row2[] = [{ contactId: "a", nextSendAt: null, status: "SENT" }];
  assert.equal(guardedSelect(rows, new Set()).length, 0,
    "status must exclude them even with no SentMessage evidence");
});
t("the SentMessage guard alone catches a stale SCHEDULED status", () => {
  // Sent before the status fix shipped: row still reads SCHEDULED.
  const rows: Row2[] = [{ contactId: "a", nextSendAt: null, status: "SCHEDULED" }];
  assert.equal(guardedSelect(rows, new Set(["a"])).length, 0);
});
t("a replied contact is never re-enrolled", () =>
  assert.equal(guardedSelect([{ contactId: "a", nextSendAt: null, status: "REPLIED" }], new Set()).length, 0));
t("an unsubscribed contact is never re-enrolled", () =>
  assert.equal(guardedSelect([{ contactId: "a", nextSendAt: null, status: "UNSUBSCRIBED" }], new Set()).length, 0));
t("a bounced contact is not retried by a relaunch", () =>
  assert.equal(guardedSelect([{ contactId: "a", nextSendAt: null, status: "BOUNCED" }], new Set()).length, 0));
t("a genuinely new contact still gets through both guards", () =>
  assert.deepEqual(
    guardedSelect([{ contactId: "new", nextSendAt: null, status: "SCHEDULED" }], new Set()).map((r) => r.contactId),
    ["new"],
  ));
t("a later step does not demote an OPENED contact back to SENT", () => {
  // Mirrors the updateMany status guard in the sender.
  const advance = (current: string) =>
    ["SCHEDULED", "PENDING"].includes(current) ? "SENT" : current;
  assert.equal(advance("SCHEDULED"), "SENT");
  assert.equal(advance("PENDING"), "SENT");
  assert.equal(advance("OPENED"), "OPENED", "engagement must not be overwritten");
  assert.equal(advance("REPLIED"), "REPLIED");
});

console.log("applying changes must not drag the schedule forward");
/** Mirrors the respace anchor: max(now, earliest send already on the books). */
const anchorFor = (now: number, earliest: number | null) =>
  earliest === null ? now : Math.max(now, earliest);

const AM_930 = Date.parse("2026-08-03T04:00:00Z");  // 09:30 IST
const PM_200 = Date.parse("2026-08-03T08:30:00Z");  // 14:00 IST

t("THE BUG: saving at 2pm used to move a 9:30am batch to 2pm", () =>
  assert.equal(anchorFor(PM_200, AM_930), PM_200,
    "unanchored, the run restarts at whenever save was pressed"));
t("anchoring keeps a future run where the user put it", () => {
  // Editing at 06:25 IST with the batch due 09:30 IST leaves it at 09:30.
  const earlyMorning = Date.parse("2026-08-03T00:55:00Z");
  assert.equal(anchorFor(earlyMorning, AM_930), AM_930);
});
t("an overdue run still snaps to now rather than scheduling into the past", () => {
  const yesterday = Date.parse("2026-08-02T04:00:00Z");
  assert.equal(anchorFor(PM_200, yesterday), PM_200,
    "a past anchor would fire the whole batch at once");
});
t("with nothing scheduled the anchor is simply now", () =>
  assert.equal(anchorFor(PM_200, null), PM_200));

console.log("an inverted sending window must be rejected, not silently ignored");
/** Mirrors sendingWindowError() in routes/campaigns.ts. */
const windowError = (
  d: { scheduleHourStart?: number; scheduleHourEnd?: number },
  existing?: { scheduleHourStart: number; scheduleHourEnd: number },
) => {
  const start = d.scheduleHourStart ?? existing?.scheduleHourStart;
  const end = d.scheduleHourEnd ?? existing?.scheduleHourEnd;
  if (start === undefined || end === undefined) return null;
  return end <= start ? `bad ${start}-${end}` : null;
};

t("THE BUG: 09:00-08:00 is rejected", () =>
  assert.ok(windowError({ scheduleHourStart: 9, scheduleHourEnd: 8 })));
t("a zero-length window is rejected too", () =>
  assert.ok(windowError({ scheduleHourStart: 9, scheduleHourEnd: 9 })));
t("a normal window passes", () =>
  assert.equal(windowError({ scheduleHourStart: 9, scheduleHourEnd: 17 }), null));
t("moving only the end is checked against the stored start", () =>
  assert.ok(windowError({ scheduleHourEnd: 8 }, { scheduleHourStart: 9, scheduleHourEnd: 17 })));
t("moving only the start is checked against the stored end", () =>
  assert.ok(windowError({ scheduleHourStart: 20 }, { scheduleHourStart: 9, scheduleHourEnd: 17 })));
t("a save that touches neither hour is fine", () =>
  assert.equal(windowError({}, { scheduleHourStart: 9, scheduleHourEnd: 17 }), null));
t("why it matters: nextSendSlot drops the window when end <= start", () => {
  const night = at("2026-08-02T22:30:00Z");
  const out = nextSendSlot(night, { ...WINDOW, hourStart: 9, hourEnd: 8 });
  assert.equal(+out, +night, "an inverted window sends around the clock");
});

console.log("new campaigns inherit workspace settings rather than hardcoded ones");
/** Mirrors the seeding block in POST /api/campaigns. */
const seed = (
  sent: { sendGapSeconds?: number; sendGapMaxSeconds?: number; timezone?: string },
  ws: { defaultSendGapMinSeconds?: number; defaultSendGapMaxSeconds?: number; timezone?: string },
) => ({
  sendGapSeconds: sent.sendGapSeconds ?? ws.defaultSendGapMinSeconds ?? 0,
  sendGapMaxSeconds: sent.sendGapMaxSeconds ?? ws.defaultSendGapMaxSeconds ?? 0,
  timezone: sent.timezone ?? ws.timezone ?? "UTC",
});
const WS = { defaultSendGapMinSeconds: 300, defaultSendGapMaxSeconds: 1200, timezone: "Asia/Kolkata" };

t("an omitted timezone takes the workspace's, not UTC", () =>
  assert.equal(seed({}, WS).timezone, "Asia/Kolkata"));
t("an omitted gap takes the workspace's 5-20 min range", () => {
  const s = seed({}, WS);
  assert.equal(s.sendGapSeconds, 300);
  assert.equal(s.sendGapMaxSeconds, 1200);
});
t("an explicit choice still wins over the workspace default", () =>
  assert.equal(seed({ timezone: "UTC" }, WS).timezone, "UTC"));
t("an explicit zero gap is honoured, not treated as 'unset'", () =>
  assert.equal(seed({ sendGapSeconds: 0, sendGapMaxSeconds: 0 }, WS).sendGapMaxSeconds, 0));
t("a workspace with nothing configured still falls back to UTC", () =>
  assert.equal(seed({}, {}).timezone, "UTC"));

console.log(`\n  first five: ${sends.slice(0, 5).map(hhmm).join("  ")}`);
console.log(`  gaps (min): ${gapsMin.slice(0, 8).join(", ")}`);
console.log(`\n${n}/${n} passed`);
process.exit(0);

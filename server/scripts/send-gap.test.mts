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
import { nextSendSlot } from "../src/services/campaign-manual-scheduler.js";

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

console.log(`\n  first five: ${sends.slice(0, 5).map(hhmm).join("  ")}`);
console.log(`  gaps (min): ${gapsMin.slice(0, 8).join(", ")}`);
console.log(`\n${n}/${n} passed`);
process.exit(0);

/**
 * Apollo drip cursor.
 *
 *   node server/scripts/apollo-drip.test.mjs
 *
 * The drip reveals a fixed number of people a day and resumes tomorrow where
 * it stopped. Every reveal costs a credit, so the cursor has exactly two ways
 * to be wrong and both cost real money: advance too far and people are skipped
 * forever, advance too little and they are revealed — and charged — twice.
 *
 * This mirrors the loop in services/apollo-drip.service.ts.
 */
import assert from "node:assert/strict";

let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };
const ta = async (label, fn) => { await fn(); n++; console.log("  ok  " + label); };

const PER_PAGE = 25;

/**
 * @param job    {page, offsetInPage, dailyLimit}
 * @param pages  array of arrays of person ids — the Apollo result pages
 * @param reveal (id) => "ok" | "fail" | "no-credits"
 * @param onList Set of ids already on the list
 */
async function runDrip(job, pages, reveal, onList = new Set(), maxPagesPerRun = 40) {
  let page = job.page;
  let offset = job.offsetInPage;
  let added = 0, revealed = 0, skipped = 0, alreadyOnList = 0;
  let status = "ACTIVE";
  let stoppedBecause;
  let pagesScanned = 0;
  const chargedFor = [];

  while (added < job.dailyLimit) {
    if (pagesScanned >= maxPagesPerRun) { stoppedBecause = "page_budget_reached"; break; }
    pagesScanned += 1;
    const rows = pages[page - 1] ?? [];
    const hasNextPage = page < pages.length;
    if (rows.length === 0) { status = "COMPLETED"; stoppedBecause = "no_more_results"; break; }

    let outOfCredits = false;
    for (let i = offset; i < rows.length; i += 1) {
      if (added >= job.dailyLimit) break;
      const id = rows[i];
      offset = i + 1;

      // Membership is settled from our own data BEFORE any reveal. This is the
      // whole point: seeing someone the list already has must cost nothing.
      if (onList.has(id)) { alreadyOnList += 1; continue; }

      const outcome = reveal(id);
      if (outcome !== "ok") {
        if (outcome === "no-credits") {
          offset = i;          // rewind: never paid, so retry this person tomorrow
          outOfCredits = true;
          break;
        }
        skipped += 1;
        continue;
      }
      chargedFor.push(id);
      revealed += 1;
      onList.add(id);
      added += 1;
    }

    if (outOfCredits) { stoppedBecause = "insufficient_credits"; break; }

    if (offset >= rows.length) {
      if (!hasNextPage) { status = "COMPLETED"; stoppedBecause = "no_more_results"; break; }
      page += 1;
      offset = 0;
    }
  }
  return { page, offset, added, revealed, skipped, alreadyOnList, status, stoppedBecause, chargedFor, onList };
}

const mkPages = (total, per = PER_PAGE) => {
  const pages = [];
  for (let i = 0; i < total; i += per) {
    pages.push(Array.from({ length: Math.min(per, total - i) }, (_, k) => `p${i + k}`));
  }
  return pages;
};
const alwaysOk = () => "ok";

console.log("the daily cap");
await ta("stops at exactly dailyLimit even though more results exist", async () => {
  const out = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 50 }, mkPages(3000), alwaysOk);
  assert.equal(out.added, 50);
  assert.equal(out.chargedFor.length, 50, "must not pay for anyone past the cap");
});
await ta("a cap smaller than one page still stops mid-page", async () => {
  const out = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 10 }, mkPages(3000), alwaysOk);
  assert.equal(out.added, 10);
  assert.equal(out.page, 1);
  assert.equal(out.offset, 10, "cursor must sit mid-page for tomorrow");
});

console.log("resuming — nobody paid for twice, nobody skipped");
await ta("day 2 starts exactly where day 1 stopped", async () => {
  const pages = mkPages(3000);
  const d1 = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 50 }, pages, alwaysOk);
  const d2 = await runDrip({ page: d1.page, offsetInPage: d1.offset, dailyLimit: 50 }, pages, alwaysOk);
  const overlap = d1.chargedFor.filter((id) => d2.chargedFor.includes(id));
  assert.deepEqual(overlap, [], `paid twice for: ${overlap.join(", ")}`);
  assert.equal(d2.added, 50);
});
await ta("thirty consecutive days cover the result set with no gaps or repeats", async () => {
  const pages = mkPages(3000);
  let cursor = { page: 1, offsetInPage: 0, dailyLimit: 50 };
  const seen = [];
  for (let day = 0; day < 30; day += 1) {
    const out = await runDrip(cursor, pages, alwaysOk);
    seen.push(...out.chargedFor);
    cursor = { page: out.page, offsetInPage: out.offset, dailyLimit: 50 };
  }
  assert.equal(seen.length, 1500, "30 days x 50/day");
  assert.equal(new Set(seen).size, 1500, "no one revealed twice");
  const expected = pages.flat().slice(0, 1500);
  assert.deepEqual(seen, expected, "must walk the result set in order, no holes");
});
await ta("the cursor crosses page boundaries correctly", async () => {
  // 25/page, 30/day → day 1 ends 5 into page 2.
  const pages = mkPages(300);
  const out = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 30 }, pages, alwaysOk);
  assert.equal(out.page, 2);
  assert.equal(out.offset, 5);
});

console.log("running out of credits");
await ta("rewinds so the unpaid person is retried, not skipped", async () => {
  const pages = mkPages(300);
  let calls = 0;
  const out = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 50 }, pages,
    () => (++calls > 10 ? "no-credits" : "ok"));
  assert.equal(out.chargedFor.length, 10);
  assert.equal(out.offset, 10, "cursor must point AT the unpaid person, not past them");
  assert.equal(out.stoppedBecause, "insufficient_credits");

  // Tomorrow, with credits restored, that person is the first one tried.
  const next = await runDrip({ page: out.page, offsetInPage: out.offset, dailyLimit: 50 }, pages, alwaysOk);
  assert.equal(next.chargedFor[0], pages[0][10], "the person we couldn't afford must come first");
});
await ta("a failed reveal is skipped and NOT retried forever", async () => {
  const pages = mkPages(300);
  const out = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 5 }, pages,
    (id) => (id === "p0" ? "fail" : "ok"));
  assert.equal(out.skipped, 1);
  assert.equal(out.added, 5, "the cap counts people actually added");
  assert.ok(out.offset > 0);
});

console.log("excluding people the list already has — the expensive mistake");
await ta("someone already on the list is skipped WITHOUT being charged for", async () => {
  const pages = mkPages(300);
  const onList = new Set(["p0", "p1", "p2"]);
  const out = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 5 }, pages, alwaysOk, onList);
  assert.equal(out.alreadyOnList, 3);
  assert.equal(out.added, 5, "must still deliver a full day despite the duplicates");
  for (const id of ["p0", "p1", "p2"]) {
    assert.ok(!out.chargedFor.includes(id), `paid again for ${id}, which was already on the list`);
  }
});
await ta("THE SCENARIO: 500 already on the list costs 50 credits, not 550", async () => {
  const pages = mkPages(3000);
  // The list already holds the first 500 people this filter returns.
  const onList = new Set(pages.flat().slice(0, 500));
  const out = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 50 }, pages, alwaysOk, onList);
  assert.equal(out.added, 50);
  assert.equal(
    out.chargedFor.length,
    50,
    `charged for ${out.chargedFor.length} people to add 50 — the pre-reveal membership check is not working`,
  );
  assert.equal(out.alreadyOnList, 500, "all 500 should have been recognised for free");
});
await ta("the 50 added are all NEW — none of them was already on the list", async () => {
  const pages = mkPages(3000);
  const existing = pages.flat().slice(0, 500);
  const out = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 50 }, pages, alwaysOk, new Set(existing));
  const overlap = out.chargedFor.filter((id) => existing.includes(id));
  assert.deepEqual(overlap, [], `re-added people already on the list: ${overlap.join(", ")}`);
  assert.deepEqual(out.chargedFor, pages.flat().slice(500, 550), "should continue past the known 500");
});
await ta("a cursor reset re-scans from page 1 for free instead of re-billing", async () => {
  // Apollo re-ranks, or an admin resets the cursor: the run starts over at
  // page 1. Membership is checked against our own data, so the re-scan is free.
  const pages = mkPages(3000);
  const onList = new Set(pages.flat().slice(0, 200));
  const out = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 50 }, pages, alwaysOk, onList);
  assert.equal(out.chargedFor.length, 50);
  assert.equal(out.alreadyOnList, 200);
});
await ta("a run whose pages are ALL duplicates stops on the page budget, still ACTIVE", async () => {
  const pages = mkPages(3000);
  const out = await runDrip(
    { page: 1, offsetInPage: 0, dailyLimit: 50 }, pages, alwaysOk, new Set(pages.flat()), 5,
  );
  assert.equal(out.chargedFor.length, 0, "must not spend anything when everyone is known");
  assert.equal(out.stoppedBecause, "page_budget_reached");
  assert.equal(out.status, "ACTIVE", "not an error — tomorrow resumes from the saved cursor");
  // Five pages scanned (1-5), so the cursor points at 6 — where tomorrow starts.
  assert.equal(out.page, 6, "the cursor must have advanced past the scanned pages");
});

console.log("exhaustion");
await ta("a filter smaller than one day's quota completes instead of looping", async () => {
  const out = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 50 }, mkPages(12), alwaysOk);
  assert.equal(out.added, 12);
  assert.equal(out.status, "COMPLETED");
  assert.equal(out.stoppedBecause, "no_more_results");
});
await ta("a completed drip run again adds nobody and charges nothing", async () => {
  const pages = mkPages(12);
  const first = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 50 }, pages, alwaysOk);
  const again = await runDrip(
    { page: first.page, offsetInPage: first.offset, dailyLimit: 50 }, pages, alwaysOk, first.onList,
  );
  assert.equal(again.chargedFor.length, 0, "an exhausted drip must not re-bill the same people");
});
await ta("an empty result set completes without spending", async () => {
  const out = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 50 }, [], alwaysOk);
  assert.equal(out.chargedFor.length, 0);
  assert.equal(out.status, "COMPLETED");
});

console.log("run-now returns immediately and cannot double-start");
/** Mirrors the Redis NX lock guarding runApolloDrip. */
function makeLock() {
  const held = new Set();
  return {
    acquire: (id) => (held.has(id) ? false : (held.add(id), true)),
    release: (id) => held.delete(id),
    isRunning: (id) => held.has(id),
  };
}

await ta("a second click while a run is in flight does not start another", async () => {
  const lock = makeLock();
  assert.equal(lock.acquire("d1"), true, "first run starts");
  assert.equal(lock.acquire("d1"), false, "second must be refused");
  assert.equal(lock.isRunning("d1"), true);
  lock.release("d1");
  assert.equal(lock.acquire("d1"), true, "and can run again once finished");
});
await ta("two concurrent runs would have double-spent the same people", async () => {
  // Without the lock both runs read the same cursor and reveal the same slice.
  const pages = mkPages(300);
  const a = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 5 }, pages, alwaysOk);
  const b = await runDrip({ page: 1, offsetInPage: 0, dailyLimit: 5 }, pages, alwaysOk);
  const overlap = a.chargedFor.filter((id) => b.chargedFor.includes(id));
  assert.equal(overlap.length, 5, "identical cursor, identical charges — this is what the lock prevents");
});
t("a different drip is not blocked by another one running", () => {
  const lock = makeLock();
  lock.acquire("d1");
  assert.equal(lock.acquire("d2"), true);
});
t("the response says started, not finished — the work continues after the reply", () => {
  const reply = { started: true, alreadyRunning: false, message: "Started — up to 50 contacts…" };
  assert.equal(reply.started, true);
  assert.match(reply.message, /^Started/);
});
t("an already-running drip reports that rather than erroring", () => {
  const reply = { started: false, alreadyRunning: true, message: "This drip is already running…" };
  assert.equal(reply.alreadyRunning, true);
  assert.equal(reply.started, false);
});

console.log("a non-JSON reply must not surface as a parse error");
/** Mirrors the client's read-once-then-decide handling. */
function handleReply(status, body) {
  try {
    const payload = body ? JSON.parse(body) : {};
    if (status >= 400) return { kind: "error", message: payload.error?.message ?? "Action failed" };
    return { kind: "ok", message: payload.data?.message };
  } catch {
    return {
      kind: "error",
      message: status < 400
        ? "The server replied with something unexpected. The action may still have gone through — refresh to check."
        : `The server returned an error (${status}). Try again in a moment.`,
    };
  }
}

t("THE BUG: a 504 HTML page no longer reads as 'Unexpected token <'", () => {
  const out = handleReply(504, "<html> <head><title>504 Gateway Time-out</title>");
  assert.equal(out.kind, "error");
  assert.doesNotMatch(out.message, /Unexpected token/);
  assert.match(out.message, /504/);
});
t("a normal JSON reply still works", () =>
  assert.equal(handleReply(200, JSON.stringify({ data: { message: "Started" } })).message, "Started"));
t("a JSON error still shows the server's own wording", () =>
  assert.equal(
    handleReply(400, JSON.stringify({ error: { message: "Drip is PAUSED — resume it first." } })).message,
    "Drip is PAUSED — resume it first.",
  ));
t("an empty body does not throw", () =>
  assert.equal(handleReply(200, "").kind, "ok"));

console.log("filter shape — the drip must replay the search the admin previewed");
/**
 * A screen full of filters arrived at the server as an empty object and was
 * rejected as unfiltered, because the schedule dialog was handed the
 * vessel-scoped filter dialect (`seniority`, `includeTitle`, no locations)
 * while the server validates the Apollo-search dialect. Zod strips unknown
 * keys, so nothing survived and nothing complained until the final check.
 */
const APOLLO_FILTER_KEYS = [
  "includeTitles", "excludeTitles", "seniorities",
  "personLocations", "companyLocations", "employeeRanges", "keywords",
];
const LEGACY_VESSEL_KEYS = [
  "includeTitle", "excludeTitle", "includeCompany", "excludeCompany", "seniority", "vesselId",
];

/** Mirrors filterSchema + hasAnyFilter in routes/admin/apollo-drips.ts. */
const acceptDripFilter = (body) => {
  const allowed = new Set([...APOLLO_FILTER_KEYS, "emailStatus", "includeSimilarTitles"]);
  const parsed = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.has(k)));
  const len = (k) => (Array.isArray(parsed[k]) ? parsed[k].length : 0);
  const ok =
    len("includeTitles") > 0 || len("seniorities") > 0 || len("personLocations") > 0 ||
    len("companyLocations") > 0 || len("employeeRanges") > 0 || Boolean(parsed.keywords);
  return { parsed, ok };
};

// The filter from the report: seniorities set, one excluded title.
const REPORTED = { includeTitles: [], excludeTitles: ["intern"], seniorities: ["owner", "founder", "head", "director"], personLocations: [], companyLocations: [], employeeRanges: [] };

t("THE BUG: the legacy vessel dialect is stripped to nothing", () => {
  const legacy = { seniority: ["owner", "founder"], excludeTitle: ["intern"], vesselId: [] };
  const { parsed, ok } = acceptDripFilter(legacy);
  assert.deepEqual(parsed, {}, "none of the legacy keys are recognised");
  assert.equal(ok, false, "which is why a screen of filters read as unfiltered");
});
t("the Apollo dialect carries the seniorities through", () => {
  const { parsed, ok } = acceptDripFilter(REPORTED);
  assert.deepEqual(parsed.seniorities, ["owner", "founder", "head", "director"]);
  assert.equal(ok, true);
});
t("the two dialects share no key names at all — silent drift was inevitable", () => {
  const overlap = APOLLO_FILTER_KEYS.filter((k) => LEGACY_VESSEL_KEYS.includes(k));
  assert.deepEqual(overlap, []);
});
t("an exclude-only filter is still rejected — it constrains almost nothing", () =>
  assert.equal(acceptDripFilter({ excludeTitles: ["intern"] }).ok, false));
t("keywords alone are enough", () =>
  assert.equal(acceptDripFilter({ keywords: "shipping" }).ok, true));
t("company size alone is enough", () =>
  assert.equal(acceptDripFilter({ employeeRanges: ["1,20"] }).ok, true));
t("a genuinely empty filter is still refused", () =>
  assert.equal(acceptDripFilter({}).ok, false));

console.log("throughput — a drip is only useful if the campaign can send what it adds");
/**
 * Sustainable rate, given how the caps actually compose.
 *
 * campaign.dailyLimit is enforced campaign-WIDE (`campaignSent >=
 * campaign.dailyLimit` in sequence-sender), across every inbox and every step.
 * So an N-step sequence spends N sends per contact in steady state, and inbox
 * capacity caps it independently.
 */
const sustainableDrip = ({ campaignDailyLimit, inboxCapacity, steps }) =>
  Math.floor(Math.min(campaignDailyLimit, inboxCapacity) / Math.max(1, steps));

t("a 2-step campaign consumes two sends per contact in steady state", () =>
  assert.equal(sustainableDrip({ campaignDailyLimit: 50, inboxCapacity: 50, steps: 2 }), 25));
t("THE LIVE SETUP: 50/day drip is double what the campaign can send", () => {
  const safe = sustainableDrip({ campaignDailyLimit: 50, inboxCapacity: 50, steps: 2 });
  assert.ok(safe < 50, `drip of 50/day against a sustainable ${safe}/day builds a backlog forever`);
});
t("fixing the ERRORed inbox doubles capacity but the campaign cap still binds", () =>
  // Two usable inboxes = 100/day of inbox capacity, but campaign cap is 50.
  assert.equal(sustainableDrip({ campaignDailyLimit: 50, inboxCapacity: 100, steps: 2 }), 25));
t("raising BOTH is what actually supports 50 new contacts a day", () =>
  assert.equal(sustainableDrip({ campaignDailyLimit: 100, inboxCapacity: 100, steps: 2 }), 50));
t("a single-step campaign sustains twice the drip rate", () =>
  assert.equal(sustainableDrip({ campaignDailyLimit: 50, inboxCapacity: 50, steps: 1 }), 50));

console.log("credit runway");
const runwayDays = (balance, perDay, creditsPerReveal = 1) =>
  Math.floor(balance / (perDay * creditsPerReveal));
t("377 credits at 50 reveals/day is one week", () =>
  assert.equal(runwayDays(377, 50), 7));
t("halving the drip rate doubles the runway", () =>
  assert.equal(runwayDays(377, 25), 15));

console.log(`\n${n}/${n} passed`);

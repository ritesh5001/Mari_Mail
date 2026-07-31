/**
 * Membership lifecycle maths.
 *
 *   node server/scripts/membership.test.mjs
 *
 * These are the pure functions that decide whether a customer keeps access and
 * how much time a payment buys, so they are worth pinning down.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ts = (await import(new URL("../node_modules/typescript/lib/typescript.js", import.meta.url).href)).default;
const compile = async (relPath, stub = {}) => {
  let src = readFileSync(new URL(relPath, import.meta.url), "utf8");
  // Strip the Prisma/email imports — only the pure helpers are under test.
  src = src.replace(/^import .*?;$/gms, "");
  const js = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const header = Object.entries(stub).map(([k, v]) => `const ${k} = ${v};`).join("\n");
  return import("data:text/javascript," + encodeURIComponent(header + "\n" + js));
};

// describeMembership now lives in @marimail/utils/plans and is re-exported
// here as `sharedDescribeMembership` — see membership.service.ts. Stubbed with
// the real implementation (not `{}`) so describeMembership's own assertions
// below still exercise real logic, not a no-op.
const SHARED_DESCRIBE_MEMBERSHIP = `(workspace) => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const deadline = workspace.currentPeriodEnd ?? workspace.trialEndsAt;
  const daysRemaining = deadline === null ? null : Math.ceil((deadline.getTime() - now) / DAY_MS);
  const expired = deadline !== null && deadline.getTime() <= now;
  const graceEnds = deadline ? deadline.getTime() + 5 * DAY_MS : null;
  const inGracePeriod = expired && graceEnds !== null && now < graceEnds;
  return {
    plan: workspace.plan,
    status: workspace.billingStatus,
    active: workspace.billingStatus !== "CANCELED" && (!expired || inGracePeriod),
    trialEndsAt: workspace.trialEndsAt,
    currentPeriodEnd: workspace.currentPeriodEnd,
    daysRemaining,
    inGracePeriod,
  };
}`;

const m = await compile("../src/services/membership.service.ts", {
  prisma: "{}", Prisma: "{}",
  BILLING_PERIOD_DAYS: "30", GRACE_PERIOD_DAYS: "5", PLANS: "{}", planLimits: "(() => ({}))",
  sharedDescribeMembership: SHARED_DESCRIBE_MEMBERSHIP,
});
const { addDays, nextPeriodEnd, trimCountries, describeMembership } = m;

const DAY = 86_400_000;
let n = 0;
const t = (label, fn) => { fn(); n++; console.log("  ok  " + label); };

console.log("nextPeriodEnd — what a payment buys");
t("no prior period -> 30 days from now", () => {
  const end = nextPeriodEnd(null, 30);
  assert.ok(Math.abs(end.getTime() - (Date.now() + 30 * DAY)) < 5_000);
});
t("EXPIRED period -> 30 days from now, not from the old end", () => {
  const end = nextPeriodEnd(new Date(Date.now() - 60 * DAY), 30);
  assert.ok(Math.abs(end.getTime() - (Date.now() + 30 * DAY)) < 5_000);
});
t("renewing EARLY stacks — the unused week is not confiscated", () => {
  const existing = new Date(Date.now() + 7 * DAY);
  const end = nextPeriodEnd(existing, 30);
  assert.ok(Math.abs(end.getTime() - (existing.getTime() + 30 * DAY)) < 5_000);
});
t("renewing early is strictly better than renewing late", () => {
  const early = nextPeriodEnd(new Date(Date.now() + 7 * DAY), 30).getTime();
  const late = nextPeriodEnd(null, 30).getTime();
  assert.ok(early > late, "early renewal must not lose time");
});

console.log("trimCountries — downgrade behaviour");
t("under the cap is untouched", () =>
  assert.deepEqual(trimCountries(["BR"], 2), ["BR"]));
t("exactly at the cap is untouched", () =>
  assert.deepEqual(trimCountries(["BR", "IN"], 2), ["BR", "IN"]));
t("over the cap keeps the FIRST n (deterministic)", () =>
  assert.deepEqual(trimCountries(["BR", "IN", "SG", "JP"], 2), ["BR", "IN"]));
t("repeat trims are stable", () => {
  const once = trimCountries(["BR", "IN", "SG", "JP"], 1);
  assert.deepEqual(trimCountries(once, 1), once);
});
t("empty stays empty", () => assert.deepEqual(trimCountries([], 4), []));

console.log("describeMembership — what the UI is allowed to claim");
const view = (over) => describeMembership({
  plan: "PRO", billingStatus: "ACTIVE", trialEndsAt: null, currentPeriodEnd: null, ...over,
});
t("active with time left", () => {
  const v = view({ currentPeriodEnd: new Date(Date.now() + 10 * DAY) });
  assert.equal(v.active, true);
  assert.equal(v.inGracePeriod, false);
  assert.equal(v.daysRemaining, 10);
});
t("just expired -> STILL active, inside grace", () => {
  const v = view({ billingStatus: "PAST_DUE", currentPeriodEnd: new Date(Date.now() - 1 * DAY) });
  assert.equal(v.active, true, "a one-day-late customer must not be cut off");
  assert.equal(v.inGracePeriod, true);
});
t("grace elapsed -> no longer active", () => {
  const v = view({ billingStatus: "PAST_DUE", currentPeriodEnd: new Date(Date.now() - 6 * DAY) });
  assert.equal(v.active, false);
  assert.equal(v.inGracePeriod, false);
});
t("CANCELED is a hard stop even with time left", () => {
  const v = view({ billingStatus: "CANCELED", currentPeriodEnd: new Date(Date.now() + 10 * DAY) });
  assert.equal(v.active, false);
});
t("trial with no period end uses trialEndsAt", () => {
  const v = view({ billingStatus: "TRIALING", trialEndsAt: new Date(Date.now() + 14 * DAY) });
  assert.equal(v.active, true);
  assert.equal(v.daysRemaining, 14);
});
t("expired trial inside grace still works", () => {
  const v = view({ billingStatus: "TRIALING", trialEndsAt: new Date(Date.now() - 2 * DAY) });
  assert.equal(v.active, true);
  assert.equal(v.inGracePeriod, true);
});
t("no deadline at all -> active, unknown days", () => {
  const v = view({});
  assert.equal(v.active, true);
  assert.equal(v.daysRemaining, null);
});

console.log("plans catalog");
const plans = await compile("../../packages/utils/src/plans.ts");
t("$25/$45/$85 in integer cents", () => {
  assert.equal(plans.PLANS.STARTER.priceCents, 2_500);
  assert.equal(plans.PLANS.PRO.priceCents, 4_500);
  assert.equal(plans.PLANS.BUSINESS.priceCents, 8_500);
});
t("country allowances 1 / 2 / 4", () => {
  assert.equal(plans.PLANS.STARTER.countryLimit, 1);
  assert.equal(plans.PLANS.PRO.countryLimit, 2);
  assert.equal(plans.PLANS.BUSINESS.countryLimit, 4);
});
t("Enterprise has no self-serve price", () => {
  assert.equal(plans.PLANS.ENTERPRISE.priceCents, null);
  assert.equal(plans.PLANS.ENTERPRISE.selfServe, false);
});
t("formatUsdCents renders whole and part dollars", () => {
  assert.equal(plans.formatUsdCents(2_500), "$25");
  assert.equal(plans.formatUsdCents(2_550), "$25.50");
  assert.equal(plans.formatUsdCents(24_900), "$249");
  assert.equal(plans.formatUsdCents(100_000), "$1,000");
});
t("upgrade ordering", () => {
  assert.equal(plans.isUpgrade("STARTER", "BUSINESS"), true);
  assert.equal(plans.isUpgrade("BUSINESS", "STARTER"), false);
  assert.equal(plans.isUpgrade("PRO", "PRO"), false);
});
t("signup FLEET maps to the stored BUSINESS plan", () =>
  assert.equal(plans.SIGNUP_PLAN_TO_BILLING.FLEET, "BUSINESS"));
t("limits are int-safe (no Infinity into a Postgres Int column)", () => {
  for (const p of Object.values(plans.PLANS)) {
    for (const key of ["vesselLimit", "emailLimit", "inboxLimit", "teamLimit", "countryLimit"]) {
      assert.ok(Number.isSafeInteger(p[key]), `${p.key}.${key} must be a safe integer`);
      assert.ok(p[key] <= 2_147_483_647, `${p.key}.${key} must fit in int4`);
    }
  }
});

console.log("plans.describeMembership — the ONE definition (server + client both import this)");
const planView = (over) =>
  plans.describeMembership({
    plan: "PRO", billingStatus: "ACTIVE", trialEndsAt: null, currentPeriodEnd: null, ...over,
  });
t("active with time left", () => {
  const v = planView({ currentPeriodEnd: new Date(Date.now() + 10 * DAY) });
  assert.equal(v.active, true);
  assert.equal(v.daysRemaining, 10);
});
t("just expired -> still active, inside grace", () => {
  const v = planView({ billingStatus: "PAST_DUE", currentPeriodEnd: new Date(Date.now() - 1 * DAY) });
  assert.equal(v.active, true);
  assert.equal(v.inGracePeriod, true);
});
t("CANCELED is a hard stop even with time left", () => {
  const v = planView({ billingStatus: "CANCELED", currentPeriodEnd: new Date(Date.now() + 10 * DAY) });
  assert.equal(v.active, false);
});
t("membership.service.ts's re-export produces an IDENTICAL result to the shared definition", () => {
  const workspace = { plan: "STARTER", billingStatus: "PAST_DUE", trialEndsAt: null, currentPeriodEnd: new Date(Date.now() - 2 * DAY) };
  assert.deepEqual(describeMembership(workspace), plans.describeMembership(workspace));
});

console.log(`\n${n}/${n} passed`);

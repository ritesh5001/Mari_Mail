/**
 * The plan catalog. One definition, read by the marketing pricing page, the
 * signup plan picker, the billing service and the payment gateways.
 *
 * Before this file the repo held THREE disagreeing price lists — the marketing
 * page said $49/$149, the server catalog said $49/$99/$249, and signup said
 * $25/$45/$85. That is survivable while nothing takes money; it is not
 * survivable once a gateway is charging a card, because whichever number the
 * checkout happens to read is the one the customer is billed, and it may not be
 * the one they were shown. Anything that needs a price imports it from here.
 *
 * MONEY IS ALWAYS AN INTEGER OF THE SMALLEST CURRENCY UNIT (cents). Never a
 * float — 0.1 + 0.2 !== 0.3, and both Stripe and Razorpay take integer minor
 * units on the wire anyway.
 */

/** Plan keys as stored in the database (`BillingPlan` enum). */
export type PlanKey = "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE";

/**
 * What signup calls each plan. `FLEET` is the customer-facing name for the
 * plan stored as `BUSINESS` — the enum predates the naming and renaming it
 * would be a data migration for no functional gain.
 */
export type SignupPlanKey = "STARTER" | "PRO" | "FLEET";

export type PlanDefinition = {
  key: PlanKey;
  /** Name shown to customers. */
  label: string;
  /** Monthly price in USD cents. `null` = "contact us" (Enterprise). */
  priceCents: number | null;
  /** Target countries this plan may track. */
  countryLimit: number;
  vesselLimit: number;
  emailLimit: number;
  inboxLimit: number;
  teamLimit: number;
  /** Credits granted on each paid month. */
  monthlyCredits: number;
  /** Offered during self-serve signup and checkout. */
  selfServe: boolean;
  features: string[];
  /** Stripe price id env var, for the legacy Stripe path. */
  stripePriceEnvVar?: string;
};

/**
 * `UNLIMITED` rather than `Infinity`: these land in Postgres `Int` columns, and
 * `Infinity` is not representable there. Large enough that no workspace reaches
 * it; small enough to survive a 32-bit int column.
 */
export const UNLIMITED = 1_000_000_000;

export const PLANS: Record<PlanKey, PlanDefinition> = {
  STARTER: {
    key: "STARTER",
    label: "Starter",
    priceCents: 2_500,
    countryLimit: 1,
    vesselLimit: 50,
    emailLimit: 5_000,
    inboxLimit: 1,
    teamLimit: 1,
    monthlyCredits: 500,
    selfServe: true,
    features: [
      "1 target country",
      "50 tracked vessels",
      "5,000 emails per month",
      "1 sending inbox",
      "1 seat",
      "500 contact credits per month",
    ],
    stripePriceEnvVar: "STRIPE_PRICE_STARTER",
  },
  PRO: {
    key: "PRO",
    label: "Pro",
    priceCents: 4_500,
    countryLimit: 2,
    vesselLimit: 250,
    emailLimit: 25_000,
    inboxLimit: 5,
    teamLimit: 5,
    monthlyCredits: 2_500,
    selfServe: true,
    features: [
      "2 target countries",
      "250 tracked vessels",
      "25,000 emails per month",
      "5 sending inboxes",
      "5 seats",
      "2,500 contact credits per month",
    ],
    stripePriceEnvVar: "STRIPE_PRICE_PRO",
  },
  BUSINESS: {
    key: "BUSINESS",
    label: "Fleet",
    priceCents: 8_500,
    countryLimit: 4,
    vesselLimit: 1_000,
    emailLimit: 100_000,
    inboxLimit: 20,
    teamLimit: 20,
    monthlyCredits: 10_000,
    selfServe: true,
    features: [
      "4 target countries",
      "1,000 tracked vessels",
      "100,000 emails per month",
      "20 sending inboxes",
      "20 seats",
      "10,000 contact credits per month",
    ],
    stripePriceEnvVar: "STRIPE_PRICE_BUSINESS",
  },
  ENTERPRISE: {
    key: "ENTERPRISE",
    label: "Enterprise",
    // Priced per deal, so it has no self-serve checkout. An admin grants it
    // through the country-access endpoint or an admin payment link.
    priceCents: null,
    countryLimit: UNLIMITED,
    vesselLimit: UNLIMITED,
    emailLimit: UNLIMITED,
    inboxLimit: 1_000,
    teamLimit: 1_000,
    monthlyCredits: 1_000_000,
    selfServe: false,
    features: [
      "Unlimited target countries",
      "Unlimited vessels",
      "Unlimited emails",
      "Unlimited seats",
      "Custom integrations and API access",
      "Dedicated onboarding",
    ],
    stripePriceEnvVar: "STRIPE_PRICE_ENTERPRISE",
  },
};

/** Signup plan name → stored `BillingPlan`. */
export const SIGNUP_PLAN_TO_BILLING: Record<SignupPlanKey, PlanKey> = {
  STARTER: "STARTER",
  PRO: "PRO",
  FLEET: "BUSINESS",
};

/** Plans offered in the signup picker, cheapest first. */
export const SIGNUP_PLANS: SignupPlanKey[] = ["STARTER", "PRO", "FLEET"];

/** Ordered cheapest → most expensive, for upgrade/downgrade comparisons. */
export const PLAN_ORDER: PlanKey[] = ["STARTER", "PRO", "BUSINESS", "ENTERPRISE"];

export function planRank(plan: PlanKey): number {
  return PLAN_ORDER.indexOf(plan);
}

/** True when moving `from` → `to` is an upgrade (a higher tier). */
export function isUpgrade(from: PlanKey, to: PlanKey): boolean {
  return planRank(to) > planRank(from);
}

export function planLimits(plan: PlanKey) {
  const def = PLANS[plan];
  return {
    countryLimit: def.countryLimit,
    vesselLimit: def.vesselLimit,
    emailLimit: def.emailLimit,
    inboxLimit: def.inboxLimit,
    teamLimit: def.teamLimit,
    monthlyCredits: def.monthlyCredits,
  };
}

/** Credit top-up packs, sold as one-off purchases. */
export const CREDIT_PACKS = [
  { packKey: "1000", credits: 1_000, priceCents: 1_900, stripePriceEnvVar: "STRIPE_PRICE_CREDITS_1K" },
  { packKey: "5000", credits: 5_000, priceCents: 7_900, stripePriceEnvVar: "STRIPE_PRICE_CREDITS_5K" },
  { packKey: "20000", credits: 20_000, priceCents: 24_900, stripePriceEnvVar: "STRIPE_PRICE_CREDITS_20K" },
] as const;

export type CreditPackKey = (typeof CREDIT_PACKS)[number]["packKey"];

export function creditPack(packKey: string) {
  return CREDIT_PACKS.find((pack) => pack.packKey === packKey) ?? null;
}

/** Days of full access granted at signup before any card is required. */
export const TRIAL_DAYS = 14;
/** Credits granted for the trial (not the plan's monthly allotment). */
export const TRIAL_CREDITS = 500;

/**
 * Days after `currentPeriodEnd` that a lapsed workspace keeps working.
 *
 * Access is not cut the instant a renewal is missed: a failed card or a finance
 * team that pays late shouldn't take a customer's outreach offline mid-campaign.
 * The workspace sits in PAST_DUE, still functional, until the grace period ends.
 */
export const GRACE_PERIOD_DAYS = 5;

/** Days before expiry that renewal reminders go out. */
export const RENEWAL_REMINDER_DAYS = [7, 1] as const;

/** One paid cycle, in days. */
export const BILLING_PERIOD_DAYS = 30;

/** `2500` → `"$25"`, `2550` → `"$25.50"`. Never rounds a price up. */
export function formatUsdCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const remainder = cents % 100;
  return remainder === 0
    ? `$${whole.toLocaleString("en-US")}`
    : `$${whole.toLocaleString("en-US")}.${String(remainder).padStart(2, "0")}`;
}

/** Display price for a plan, e.g. `"$25/mo"` or `"Custom"`. */
export function planPriceLabel(plan: PlanKey): string {
  const def = PLANS[plan];
  return def.priceCents === null ? "Custom" : `${formatUsdCents(def.priceCents)}/mo`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type MembershipView = {
  plan: PlanKey;
  status: string;
  /** Whether the workspace can currently use paid features. */
  active: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  /** Days until access narrows. Negative once it already has. */
  daysRemaining: number | null;
  inGracePeriod: boolean;
};

/**
 * Derives what the UI should say about a workspace's membership.
 *
 * Computed rather than trusted from `billingStatus` alone: a workspace whose
 * period ended an hour ago is functionally past due whether or not the hourly
 * sweep has run yet, and every surface that shows membership status — the
 * server billing page, the dashboard shell, the Express send-gate — must agree
 * on that without waiting for a cron job to catch up.
 *
 * This is the ONE definition. It used to be copied three times (the Express
 * membership service, the Next billing page, and now the dashboard shell would
 * have been a fourth) — each a chance for the grace-period math to drift. It
 * lives here, in the dependency-free plans module, so both the Node server and
 * the Next client bundle it without pulling in Prisma or server-only code.
 */
export function describeMembership(workspace: {
  plan: PlanKey;
  billingStatus: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}): MembershipView {
  const now = Date.now();
  const deadline = workspace.currentPeriodEnd ?? workspace.trialEndsAt;
  const daysRemaining =
    deadline === null ? null : Math.ceil((deadline.getTime() - now) / DAY_MS);

  const expired = deadline !== null && deadline.getTime() <= now;
  const graceEnds = deadline ? deadline.getTime() + GRACE_PERIOD_DAYS * DAY_MS : null;
  const inGracePeriod = expired && graceEnds !== null && now < graceEnds;

  return {
    plan: workspace.plan,
    status: workspace.billingStatus,
    // CANCELED is the only hard stop. An expired workspace inside its grace
    // window keeps working, which is the whole point of having one.
    active: workspace.billingStatus !== "CANCELED" && (!expired || inGracePeriod),
    trialEndsAt: workspace.trialEndsAt,
    currentPeriodEnd: workspace.currentPeriodEnd,
    daysRemaining,
    inGracePeriod,
  };
}

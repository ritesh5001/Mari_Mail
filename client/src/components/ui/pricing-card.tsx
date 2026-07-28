"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Gift, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// --- Types -----------------------------------------------------------------

type BillingCycle = "monthly" | "annually";

interface Feature {
  name: string;
  isIncluded: boolean;
}

/** A per-plan numeric limit — the user gets this amount on this plan. */
interface Metric {
  label: string;
  value: string;
}

interface PriceTier {
  id: string;
  name: string;
  description: string;
  /** Monthly price in USD, or null for a "Custom" (contact-sales) tier. */
  priceMonthly: number | null;
  /** Annual price in USD (billed once/year), or null for Custom. */
  priceAnnually: number | null;
  isPopular: boolean;
  buttonLabel: string;
  href: string;
  /** During early access every paid plan is free — show the promo treatment. */
  freeEarlyAccess?: boolean;
  /** Numeric limits the subscriber gets on this plan (inboxes, credits, …). */
  metrics: Metric[];
  /** Plan-specific extras beyond the shared, all-plan feature set. */
  features: Feature[];
}

type PlanTuple = [PriceTier, PriceTier, PriceTier, PriceTier];

interface PricingProps extends React.HTMLAttributes<HTMLDivElement> {
  plans: PlanTuple;
  billingCycle: BillingCycle;
  onCycleChange: (cycle: BillingCycle) => void;
}

// --- Real MariMail plans (from the pricing sheet) --------------------------

const EARLY_ACCESS_SEATS = 100;
const ANNUAL_DISCOUNT_PERCENT = 20;

// Features every subscriber gets on every plan (the blank-value rows in the
// pricing sheet — "available for all users"). Wording is cleaned up and
// de-duplicated for the live marketing page. Rendered once as a shared band
// and marked included on each card.
const SHARED_FEATURES: string[] = [
  // Marine intelligence
  "Global vessel tracking via satellite AIS",
  "Vessel profiles, voyage data & port-call history",
  "Ship owner & manager contact directory",
  "244M-contact global B2B database",
  "Full vessel DBMS read access",
  // Targeting & alerts
  "Advanced search & filtering",
  "Real-time smart alerts",
  "Create & manage custom fleets",
  "Port Radar with smart lists",
  // Outreach engine
  "ETA & cargo-triggered sequences",
  "Multi-step email & reply tracking",
  "Inbox warmup, DNS health & A/B testing",
  "Hyper-personalized messaging",
  "Dedicated calling dialer",
  // Data & enrichment
  "Waterfall contact enrichment",
  "CSV, CRM & API data enrichment",
  "Domain & mailbox purchasing",
  "Native CRM integrations",
  "Export to Excel & CSV",
  // Support
  "Priority customer support",
];

const annual = (monthly: number) =>
  Math.round((monthly * 12 * (100 - ANNUAL_DISCOUNT_PERCENT)) / 100);

export const mariMailPlans: PlanTuple = [
  {
    id: "starter",
    name: "Starter",
    description: "For solo operators dipping into ETA-driven outreach.",
    priceMonthly: 25,
    priceAnnually: annual(25),
    isPopular: false,
    buttonLabel: "Claim free access",
    href: "/book-demo",
    freeEarlyAccess: true,
    metrics: [
      { label: "Target countries", value: "1" },
      { label: "Connected inboxes", value: "1" },
      { label: "Enrichment credits", value: "5,000" },
      { label: "Active sequences", value: "5" },
    ],
    features: [],
  },
  {
    id: "pro",
    name: "Pro",
    description: "For growing desks running multi-market outreach.",
    priceMonthly: 45,
    priceAnnually: annual(45),
    isPopular: true,
    buttonLabel: "Claim free access",
    href: "/book-demo",
    freeEarlyAccess: true,
    metrics: [
      { label: "Target countries", value: "2" },
      { label: "Connected inboxes", value: "2" },
      { label: "Enrichment credits", value: "10,000" },
      { label: "Active sequences", value: "10" },
    ],
    features: [{ name: "SSO + role-based access", isIncluded: false }],
  },
  {
    id: "fleet",
    name: "Fleet",
    description: "For brokerages scaling across regions.",
    priceMonthly: 85,
    priceAnnually: annual(85),
    isPopular: false,
    buttonLabel: "Claim free access",
    href: "/book-demo",
    freeEarlyAccess: true,
    metrics: [
      { label: "Target countries", value: "4" },
      { label: "Connected inboxes", value: "4" },
      { label: "Enrichment credits", value: "20,000" },
      { label: "Active sequences", value: "15" },
    ],
    features: [{ name: "SSO + role-based access", isIncluded: true }],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For shipping groups that need everything, unmetered.",
    priceMonthly: null,
    priceAnnually: null,
    isPopular: false,
    buttonLabel: "Talk to sales",
    href: "mailto:info@maribiz.ai",
    metrics: [
      { label: "Target countries", value: "Unlimited" },
      { label: "Connected inboxes", value: "Unlimited" },
      { label: "Enrichment credits", value: "Unlimited" },
      { label: "Active sequences", value: "Unlimited" },
    ],
    features: [
      { name: "SSO + role-based access", isIncluded: true },
      { name: "Dedicated tenant + SLA", isIncluded: true },
    ],
  },
];

// --- Helpers ---------------------------------------------------------------

function formatPrice(value: number) {
  return `$${value.toLocaleString("en")}`;
}

const FeatureItem: React.FC<{ feature: Feature }> = ({ feature }) => {
  const Icon = feature.isIncluded ? Check : X;
  return (
    <li className="flex items-start gap-3 py-1.5">
      <span
        className={cn(
          "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          feature.isIncluded
            ? "bg-accent-500/15 text-accent-600 dark:text-accent-300"
            : "bg-slate-100 text-slate-400 dark:bg-white/[0.06] dark:text-white/40",
        )}
      >
        <Icon className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
      </span>
      <span
        className={cn(
          "text-sm",
          feature.isIncluded
            ? "text-slate-700 dark:text-white/75"
            : "text-slate-400 line-through dark:text-white/35",
        )}
      >
        {feature.name}
      </span>
    </li>
  );
};

// --- Main component --------------------------------------------------------

const PricingComponent: React.FC<PricingProps> = ({
  plans,
  billingCycle,
  onCycleChange,
  className,
  ...props
}) => {
  if (plans.length !== 4) {
    console.error("PricingComponent requires exactly 4 pricing tiers.");
    return null;
  }

  // Comparison-table rows = shared (all-plan) features + any plan-specific ones.
  const planSpecific = Array.from(new Set(plans.flatMap((p) => p.features.map((f) => f.name))));
  const allFeatures = [...SHARED_FEATURES, ...planSpecific];

  const CycleToggle = (
    <div className="mb-12 flex justify-center">
      <ToggleGroup
        type="single"
        value={billingCycle}
        onValueChange={(value) => {
          if (value === "monthly" || value === "annually") onCycleChange(value);
        }}
        aria-label="Select billing cycle"
        className="rounded-lg border border-slate-200 bg-slate-100/60 p-1 dark:border-white/10 dark:bg-white/[0.04]"
      >
        <ToggleGroupItem value="monthly" aria-label="Monthly billing" className="rounded-md px-6">
          Monthly
        </ToggleGroupItem>
        <ToggleGroupItem
          value="annually"
          aria-label="Annual billing"
          className="relative rounded-md px-6"
        >
          Annually
          <span className="absolute -top-3 right-0 whitespace-nowrap rounded-full bg-accent-500/10 px-1.5 text-[10px] font-semibold text-accent-600 dark:bg-accent-500/20 dark:text-accent-300">
            Save {ANNUAL_DISCOUNT_PERCENT}%
          </span>
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );

  const PricingCards = (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
      {plans.map((plan) => {
        const isFeatured = plan.isPopular;
        const isCustom = plan.priceMonthly === null;
        const currentPrice = billingCycle === "monthly" ? plan.priceMonthly : plan.priceAnnually;
        const priceSuffix = billingCycle === "monthly" ? "/mo" : "/yr";

        return (
          <Card
            key={plan.id}
            className={cn(
              "flex flex-col transition-all duration-300 hover:-translate-y-1",
              isFeatured &&
                "ring-2 ring-accent-500 shadow-xl md:scale-[1.02] dark:ring-accent-500/70 dark:shadow-[0_24px_80px_rgba(79,109,255,0.18)]",
            )}
          >
            <CardHeader className="pb-4">
              <div className="flex items-start justify-between">
                <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                {isFeatured && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-500 px-3 py-1 text-xs font-semibold text-white">
                    <Sparkles className="h-3 w-3" />
                    Most popular
                  </span>
                )}
              </div>
              <CardDescription className="mt-1">{plan.description}</CardDescription>

              <div className="mt-4">
                {isCustom ? (
                  <p className="text-4xl font-extrabold text-slate-900 dark:text-white">Custom</p>
                ) : plan.freeEarlyAccess ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-extrabold text-slate-900 dark:text-white">
                        Free
                      </span>
                      <span className="text-xl font-semibold text-slate-400 line-through dark:text-white/35">
                        {formatPrice(currentPrice as number)}
                      </span>
                      <span className="text-sm text-slate-400 line-through dark:text-white/35">
                        {priceSuffix}
                      </span>
                    </div>
                    <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-600 dark:text-accent-300">
                      <Gift className="h-3.5 w-3.5" />
                      Free for the first {EARLY_ACCESS_SEATS} users
                    </p>
                  </>
                ) : (
                  <p className="text-4xl font-extrabold text-slate-900 dark:text-white">
                    {formatPrice(currentPrice as number)}
                    <span className="ml-1 text-base font-normal text-slate-500 dark:text-white/50">
                      {priceSuffix}
                    </span>
                  </p>
                )}
                {!isCustom && billingCycle === "annually" && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-white/45">
                    Billed annually ({formatPrice(plan.priceAnnually as number)})
                  </p>
                )}
              </div>
            </CardHeader>

            <CardContent className="flex-grow">
              {/* Per-plan numbers — what the subscriber actually gets. */}
              <dl className="grid grid-cols-2 gap-2">
                {plan.metrics.map((m) => (
                  <div
                    key={m.label}
                    className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <dt className="text-[11px] font-medium text-slate-500 dark:text-white/45">
                      {m.label}
                    </dt>
                    <dd className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">
                      {m.value}
                    </dd>
                  </div>
                ))}
              </dl>

              <h4 className="mb-2 mt-5 text-sm font-semibold text-slate-700 dark:text-white/80">
                Everything included
              </h4>
              <ul className="space-y-0">
                {/* All shared features are available on every plan. */}
                {SHARED_FEATURES.slice(0, 5).map((name) => (
                  <FeatureItem key={name} feature={{ name, isIncluded: true }} />
                ))}
                {/* Plan-specific extras (e.g. SSO / dedicated tenant). */}
                {plan.features.map((feature) => (
                  <FeatureItem key={feature.name} feature={feature} />
                ))}
                <li className="flex items-start gap-3 py-1.5 pl-8 text-sm font-medium text-accent-600 dark:text-accent-300">
                  + all {SHARED_FEATURES.length} platform features
                </li>
              </ul>
            </CardContent>

            <CardFooter>
              <Link
                href={plan.href}
                aria-label={`${plan.buttonLabel} — ${plan.name} plan`}
                className={cn(
                  "inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-semibold transition-all hover:-translate-y-0.5",
                  isFeatured
                    ? "bg-accent-500 text-white shadow-lg shadow-accent-500/20 hover:bg-accent-600 dark:shadow-accent-500/30"
                    : "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:hover:bg-white/[0.08]",
                )}
              >
                {plan.buttonLabel}
              </Link>
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );

  const ComparisonTable = (
    <div className="mt-16 hidden overflow-x-auto rounded-lg border border-slate-200 shadow-sm md:block dark:border-white/10">
      <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10">
        <thead>
          <tr className="bg-slate-50 dark:bg-white/[0.03]">
            <th
              scope="col"
              className="w-[240px] whitespace-nowrap px-6 py-4 text-left text-sm font-semibold text-slate-700 dark:text-white/80"
            >
              Feature
            </th>
            {plans.map((plan) => (
              <th
                key={`th-${plan.id}`}
                scope="col"
                className={cn(
                  "whitespace-nowrap px-6 py-4 text-center text-sm font-semibold text-slate-700 dark:text-white/80",
                  plan.isPopular && "bg-accent-500/10 dark:bg-accent-500/15",
                )}
              >
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-white/10">
          {/* Numeric limit rows — show the actual amount per plan. */}
          {plans[0].metrics.map((metric, index) => (
            <tr
              key={`metric-${metric.label}`}
              className={cn(index % 2 === 1 && "bg-slate-50/60 dark:bg-white/[0.02]")}
            >
              <td className="whitespace-nowrap px-6 py-3 text-left text-sm font-semibold text-slate-800 dark:text-white/90">
                {metric.label}
              </td>
              {plans.map((plan) => (
                <td
                  key={`${plan.id}-${metric.label}`}
                  className={cn(
                    "px-6 py-3 text-center text-sm font-bold text-slate-900 dark:text-white",
                    plan.isPopular && "bg-accent-500/[0.06] dark:bg-accent-500/10",
                  )}
                >
                  {plan.metrics.find((m) => m.label === metric.label)?.value ?? "—"}
                </td>
              ))}
            </tr>
          ))}

          {/* Feature rows — shared features are included on every plan. */}
          {allFeatures.map((featureName, index) => {
            const isShared = SHARED_FEATURES.includes(featureName);
            return (
              <tr
                key={featureName}
                className={cn(
                  (plans[0].metrics.length + index) % 2 === 1 && "bg-slate-50/60 dark:bg-white/[0.02]",
                )}
              >
                <td className="whitespace-nowrap px-6 py-3 text-left text-sm font-medium text-slate-700 dark:text-white/80">
                  {featureName}
                </td>
                {plans.map((plan) => {
                  const included = isShared
                    ? true
                    : plan.features.find((f) => f.name === featureName)?.isIncluded ?? false;
                  const Icon = included ? Check : X;
                  return (
                    <td
                      key={`${plan.id}-${featureName}`}
                      className={cn(
                        "px-6 py-3 text-center",
                        plan.isPopular && "bg-accent-500/[0.06] dark:bg-accent-500/10",
                      )}
                    >
                      <Icon
                        className={cn(
                          "mx-auto h-5 w-5",
                          included
                            ? "text-accent-600 dark:text-accent-300"
                            : "text-slate-300 dark:text-white/25",
                        )}
                        aria-hidden="true"
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div
      className={cn("mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-20 lg:px-8", className)}
      {...props}
    >
      <header className="mb-10 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-accent-500/30 bg-accent-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-accent-600 dark:text-accent-300">
          <Gift className="h-3.5 w-3.5" />
          Free for our first {EARLY_ACCESS_SEATS} users
        </span>
        <h2 className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          Choose the right plan for your marine desk.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-600 dark:text-white/60">
          Scale from solo operator to enterprise brokerage — every paid plan is 100% free for the first{" "}
          {EARLY_ACCESS_SEATS} sign-ups, no credit card required.
        </p>
      </header>

      {CycleToggle}

      <section aria-label="Pricing plans">{PricingCards}</section>

      <section aria-label="Feature comparison" className="mt-16">
        <h3 className="mb-6 hidden text-center text-2xl font-bold text-slate-900 md:block dark:text-white">
          Detailed feature comparison
        </h3>
        {ComparisonTable}
      </section>

      <p className="mt-10 text-center text-sm text-slate-500 dark:text-white/45">
        All plans include self-hosted sending through your own Gmail / Outlook / SMTP inboxes. No
        per-email markup.
      </p>
    </div>
  );
};

/**
 * Drop-in Pricing section for the marketing page — pre-wired with the real
 * MariMail plans and billing-cycle state. Marketing.tsx renders this.
 */
export function PricingCard() {
  const [cycle, setCycle] = React.useState<BillingCycle>("annually");
  return (
    <section id="pricing" className="relative scroll-mt-24">
      <PricingComponent plans={mariMailPlans} billingCycle={cycle} onCycleChange={setCycle} />
    </section>
  );
}

export default PricingCard;
export { PricingComponent };
export type { BillingCycle, PriceTier, Feature };

import { Check } from "lucide-react";
import { formatUsdCents, planRank, type PlanKey } from "@marimail/utils/plans";
import { CheckoutButton } from "@/components/billing/CheckoutButton";
import { MembershipStatus } from "@/components/billing/MembershipStatus";
import { PaymentHistory } from "@/components/billing/PaymentHistory";
import { StripePortalLink } from "@/components/billing/StripePortalLink";
import { UsageBar } from "@/components/billing/UsageBar";
import {
  CREDIT_PACKS,
  GRACE_PERIOD_DAYS,
  PLAN_CATALOG,
  getBillingOverview,
  requireBillingWorkspace,
} from "@/lib/billing-data";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const { workspaceId, userName, userEmail } = await requireBillingWorkspace();
  const { workspace, membership, usage, ledger, payments } = await getBillingOverview(workspaceId);

  const currentRank = planRank(workspace.plan as PlanKey);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Plan &amp; billing</h1>
      </header>

      <MembershipStatus membership={membership} gracePeriodDays={GRACE_PERIOD_DAYS} />

      {/* Usage against the plan's limits, as bars. The question a customer
          actually has is "how close am I to needing the next tier", and two
          bare numbers side by side don't answer it at a glance. */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">This month</h2>
          <p className="text-sm text-slate-500 dark:text-white/50">
            <span className="font-semibold text-slate-900 dark:text-white">
              {workspace.creditBalance.toLocaleString("en-US")}
            </span>{" "}
            contact credits remaining
          </p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <UsageBar label="Vessels tracked" used={usage.vessels} limit={workspace.vesselLimit} />
          <UsageBar label="Emails sent" used={usage.emails} limit={workspace.emailLimit} />
          <UsageBar label="Sending inboxes" used={usage.inboxes} limit={workspace.inboxLimit} />
          <UsageBar
            label="Countries"
            used={workspace.allowedCountries.length}
            limit={workspace.countryLimit}
          />
        </div>
      </section>

      <section id="plans" className="scroll-mt-6">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Plans</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_CATALOG.map((plan) => {
            const isCurrent = workspace.plan === plan.key;
            const rank = planRank(plan.key);
            return (
              <article
                key={plan.key}
                className={`flex flex-col rounded-lg border p-5 ${
                  isCurrent
                    ? "border-accent-500 bg-white ring-1 ring-accent-500 dark:bg-[#0a0a0c]"
                    : "border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#0a0a0c]"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-accent-600 dark:text-accent-300">
                    {plan.label}
                  </p>
                  {isCurrent ? (
                    <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-[11px] font-semibold text-accent-600 dark:text-accent-300">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-3xl font-semibold text-slate-950 dark:text-white">
                  {plan.priceCents === null ? "Custom" : formatUsdCents(plan.priceCents)}
                  {plan.priceCents !== null ? (
                    <span className="text-sm font-normal text-slate-500 dark:text-white/45">
                      /mo
                    </span>
                  ) : null}
                </p>

                <ul className="mt-3 flex-1 space-y-1.5 text-sm text-slate-600 dark:text-white/60">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-4">
                  {plan.priceCents === null ? (
                    <a
                      href="/book-demo"
                      className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/[0.06]"
                    >
                      Talk to sales
                    </a>
                  ) : (
                    <CheckoutButton
                      target={{ plan: plan.key }}
                      user={{ name: userName, email: userEmail }}
                      variant={rank >= currentRank ? "primary" : "secondary"}
                      label={
                        isCurrent
                          ? "Renew for 30 days"
                          : rank > currentRank
                            ? `Upgrade to ${plan.label}`
                            : `Switch to ${plan.label}`
                      }
                    />
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Credit top-ups</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {CREDIT_PACKS.map((pack) => (
            <article
              key={pack.packKey}
              className="flex flex-col rounded-lg border border-slate-200 p-4 dark:border-white/10"
            >
              <p className="text-sm text-slate-500 dark:text-white/50">
                {pack.credits.toLocaleString("en-US")} credits
              </p>
              <p className="mb-3 mt-1 text-2xl font-semibold text-slate-950 dark:text-white">
                {formatUsdCents(pack.priceCents)}
              </p>
              <div className="mt-auto">
                <CheckoutButton
                  target={{ creditPack: pack.packKey }}
                  user={{ name: userName, email: userEmail }}
                  variant="secondary"
                  label="Buy credits"
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <PaymentHistory payments={payments} ledger={ledger} />

      {/* Only for workspaces that subscribed before Razorpay became the
          default — their subscription still renews through Stripe, and the
          portal is the only place they can change a card or cancel. */}
      {workspace.stripeCustomerId ? (
        <div className="border-t border-slate-200 pt-4 dark:border-white/[0.08]">
          <StripePortalLink />
        </div>
      ) : null}
    </div>
  );
}

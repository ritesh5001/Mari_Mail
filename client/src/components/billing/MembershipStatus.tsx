import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { PLANS, planPriceLabel, type PlanKey } from "@marimail/utils/plans";
import type { MembershipView } from "@/lib/billing-data";
import { cn } from "@/lib/cn";

/**
 * The membership banner: what plan, until when, and what happens next.
 *
 * The "what happens next" half is the point. A customer whose plan lapsed used
 * to see a `billingStatus` of `PAST_DUE` and nothing else — no date, no
 * consequence, no idea whether their campaigns were still sending. Every state
 * here states the deadline and the consequence in plain words.
 */
export function MembershipStatus({
  membership,
  gracePeriodDays,
}: {
  membership: MembershipView;
  gracePeriodDays: number;
}) {
  const def = PLANS[membership.plan as PlanKey];
  const tone = toneFor(membership);
  const Icon = tone.icon;

  return (
    <div
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-lg border px-4 py-3.5",
        tone.className,
      )}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{headline(membership, def.label)}</p>
        <p className="mt-0.5 text-sm opacity-80">{detail(membership, gracePeriodDays)}</p>
      </div>
      {!membership.active || membership.inGracePeriod || membership.status === "TRIALING" ? (
        <Link
          href="#plans"
          className="shrink-0 rounded-lg bg-accent-500 px-3.5 py-2 text-sm font-semibold text-[#ffffff] transition-colors hover:bg-accent-600"
        >
          {membership.status === "TRIALING" ? "Choose a plan" : "Renew now"}
        </Link>
      ) : null}
    </div>
  );
}

function toneFor(membership: MembershipView) {
  if (!membership.active) {
    return {
      icon: XCircle,
      className:
        "border-red-200 bg-red-50 text-red-900 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200",
    };
  }
  if (membership.inGracePeriod) {
    return {
      icon: AlertTriangle,
      className:
        "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200",
    };
  }
  // A trial, or a paid plan inside its last week, is worth flagging without
  // being alarming — amber would cry wolf on a customer who is entirely current.
  if (membership.daysRemaining !== null && membership.daysRemaining <= 7) {
    return {
      icon: Clock,
      className:
        "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-200",
    };
  }
  return {
    icon: CheckCircle2,
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200",
  };
}

function headline(membership: MembershipView, planLabel: string) {
  if (!membership.active) return `${planLabel} plan — expired`;
  if (membership.inGracePeriod) return `${planLabel} plan — payment overdue`;
  if (membership.status === "TRIALING") return `${planLabel} plan — trial`;
  return `${planLabel} plan — active`;
}

function detail(membership: MembershipView, gracePeriodDays: number) {
  const days = membership.daysRemaining;

  if (!membership.active) {
    return "Your workspace is on the minimum limits. Nothing has been deleted — renewing restores everything exactly as it was.";
  }

  if (membership.inGracePeriod) {
    // `daysRemaining` is negative here (the deadline has passed), so the grace
    // days left is the period minus how far past the deadline we are.
    const graceLeft = days === null ? gracePeriodDays : Math.max(0, gracePeriodDays + days);
    return `Everything still works for ${graceLeft} more day${graceLeft === 1 ? "" : "s"}. After that your workspace drops to the minimum limits — campaigns pause and tracking narrows to one country.`;
  }

  if (membership.status === "TRIALING") {
    // A trial ends on whichever runs out first — the days or the tokens — so
    // the days-remaining figure alone would be a half-truth to someone who is
    // about to hit the token wall on day three.
    const ends = membership.trialEndsAt ?? membership.currentPeriodEnd;
    return days === null
      ? "Full access while your trial tokens last."
      : `${days} day${days === 1 ? "" : "s"} left${ends ? `, until ${fmt(ends)}` : ""} — or until your trial tokens run out, whichever comes first. Pick a plan to keep going without a break.`;
  }

  const renews = membership.currentPeriodEnd;
  if (days === null || !renews) return "Full access to every feature on your plan.";
  return `Renews on ${fmt(renews)} — ${days} day${days === 1 ? "" : "s"} from now.`;
}

function fmt(date: Date) {
  return new Date(date).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function planPrice(plan: PlanKey) {
  return planPriceLabel(plan);
}

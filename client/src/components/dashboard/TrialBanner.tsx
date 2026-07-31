"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, X } from "lucide-react";
import { describeMembership, PLANS, type PlanKey } from "@marimail/utils/plans";
import type { WorkspaceSummary } from "@marimail/types";
import { cn } from "@/lib/cn";

/**
 * Slim, dashboard-wide strip that shows up whenever a workspace needs to
 * upgrade or renew, and links straight to checkout.
 *
 * Before this there was NO path from inside the app to buying a subscription
 * once the trial's 14 days had actually run out — `/dashboard/billing` existed,
 * but nothing pointed at it, and the trial expiring produced no
 * visible signal at all beyond emails from the renewal sweep. A customer whose
 * trial lapsed on a Tuesday could keep using the product all week inside the
 * grace period with zero indication anything had changed, then get cut off
 * with no idea why.
 *
 * Deliberately absent for a healthy ACTIVE plan with time to spare — this is a
 * "you need to act" surface, not a persistent billing widget. `MembershipStatus`
 * on the billing page itself is the always-visible version of this same state.
 * Also absent for super-admins, who have no plan of their own to act on.
 */
export function TrialBanner({
  workspace,
  isSuperAdmin = false,
}: {
  workspace: WorkspaceSummary | null;
  /** Platform staff never see plan or trial messaging — see `canViewNavItem`. */
  isSuperAdmin?: boolean;
}) {
  const [dismissedUntil, setDismissedUntil] = useState<number | null>(null);

  // Re-read on mount only — the dismissal key is scoped to today's date, so a
  // stale value from a previous day is simply ignored rather than needing an
  // active clear.
  useEffect(() => {
    if (!workspace) return;
    const raw = window.localStorage.getItem(`trial-banner-dismissed:${workspace.id}`);
    setDismissedUntil(raw ? Number(raw) : null);
  }, [workspace?.id]);

  // Suppressed for platform staff: they manage customers rather than being
  // customers, and the "Choose a plan" link below now redirects them away
  // anyway — a banner whose only action bounces you is worse than no banner.
  if (!workspace || isSuperAdmin) return null;

  const membership = describeMembership({
    plan: workspace.plan as PlanKey,
    billingStatus: workspace.billingStatus,
    trialEndsAt: workspace.trialEndsAt ? new Date(workspace.trialEndsAt) : null,
    currentPeriodEnd: workspace.currentPeriodEnd ? new Date(workspace.currentPeriodEnd) : null,
  });

  const urgency = urgencyFor(membership);
  if (urgency === "none") return null;

  // Dismissal expires at midnight, not "forever" — a trial with 2 days left is
  // exactly the case where re-surfacing tomorrow matters. `dismissedUntil`
  // stores that boundary rather than a plain boolean so it self-clears without
  // any code needing to run.
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  if (dismissedUntil && dismissedUntil > Date.now()) return null;

  const dismiss = () => {
    const until = midnight.getTime();
    window.localStorage.setItem(`trial-banner-dismissed:${workspace.id}`, String(until));
    setDismissedUntil(until);
  };

  const tone =
    urgency === "critical"
      ? "border-red-200 bg-red-50 text-red-900 dark:border-red-400/25 dark:bg-red-500/10 dark:text-red-200"
      : urgency === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200"
        : "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-400/25 dark:bg-sky-500/10 dark:text-sky-200";
  const Icon = urgency === "critical" ? AlertTriangle : Clock;

  return (
    <div className={cn("mb-4 flex items-start gap-3 rounded-lg border px-4 py-3", tone)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{headline(membership)}</span>{" "}
        <span className="opacity-85">{detail(membership)}</span>
      </p>
      <Link
        href="/dashboard/billing#plans"
        className="shrink-0 rounded-md bg-accent-500 px-3 py-1.5 text-xs font-semibold text-[#ffffff] transition-colors hover:bg-accent-600"
      >
        {membership.status === "TRIALING" ? "Choose a plan" : "Renew now"}
      </Link>
      {/* Never offered once access has actually narrowed — dismissing that
          state would hide the one thing explaining why features are limited. */}
      {membership.active ? (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss for today"
          className="shrink-0 opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

type Urgency = "none" | "info" | "warning" | "critical";

function urgencyFor(membership: ReturnType<typeof describeMembership>): Urgency {
  if (!membership.active) return "critical"; // grace period elapsed, or canceled
  if (membership.inGracePeriod) return "warning"; // lapsed, still working
  if (membership.status === "TRIALING" && membership.daysRemaining !== null) {
    if (membership.daysRemaining <= 3) return "warning";
    if (membership.daysRemaining <= 7) return "info";
  }
  // An ACTIVE paid plan never shows this banner, trial with >7 days never
  // shows it either — both are healthy states with nothing to act on.
  return "none";
}

function headline(membership: ReturnType<typeof describeMembership>) {
  const label = PLANS[membership.plan as PlanKey]?.label ?? membership.plan;
  if (!membership.active) return "Your plan has expired.";
  if (membership.inGracePeriod) return "Payment overdue.";
  if (membership.status === "TRIALING") return `Your ${label} trial is ending soon.`;
  return `${label} plan.`;
}

function detail(membership: ReturnType<typeof describeMembership>) {
  const days = membership.daysRemaining;
  if (!membership.active) {
    return "You're on the minimum limits now — nothing was deleted. Renew to restore full access.";
  }
  if (membership.inGracePeriod) {
    return "Update your payment to avoid losing access.";
  }
  if (days !== null) {
    return `Pick a plan within ${days} day${days === 1 ? "" : "s"} to keep going without a break.`;
  }
  return "Pick a plan to keep going without a break.";
}

import { prisma, Prisma, type BillingPlan, type PaymentProvider } from "@marimail/db";
import {
  BILLING_PERIOD_DAYS,
  GRACE_PERIOD_DAYS,
  PLANS,
  planLimits,
  describeMembership as sharedDescribeMembership,
  type MembershipView as SharedMembershipView,
} from "@marimail/utils/plans";

/**
 * The membership lifecycle. Every transition between billing states happens
 * here, so the rules live in one readable place rather than being reimplemented
 * slightly differently by each gateway's webhook.
 *
 *   TRIALING ──(14d elapsed, no payment)──> PAST_DUE ──(grace)──> CANCELED
 *      │                                       │                     │
 *      └──────────── payment ──────────────────┴─────────────────────┘
 *                          ↓
 *                        ACTIVE ──(period ends)──> PAST_DUE ──> CANCELED
 *
 * PAST_DUE is deliberately still a working state. A declined card or a finance
 * team that pays late should not take a customer's live campaigns offline the
 * moment the clock ticks over; access narrows only after the grace period.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/**
 * When a newly-purchased period should end.
 *
 * Extends from whichever is later: now, or the end of the period already paid
 * for. Someone who renews a week early keeps that week — computing from `now`
 * unconditionally would silently confiscate it, which is the kind of billing
 * bug that costs far more in trust than the seven days are worth.
 */
export function nextPeriodEnd(currentPeriodEnd: Date | null, days = BILLING_PERIOD_DAYS): Date {
  const now = new Date();
  const base = currentPeriodEnd && currentPeriodEnd > now ? currentPeriodEnd : now;
  return addDays(base, days);
}

/**
 * Trims a country allowlist to what a plan permits.
 *
 * Downgrading from 4 countries to 1 has to drop three of them. Keeping the
 * FIRST n rather than an arbitrary n makes the outcome deterministic and
 * predictable — the customer keeps the countries they chose first, and a repeat
 * run of the same downgrade produces the same result.
 */
export function trimCountries(allowed: string[], limit: number): string[] {
  return allowed.length <= limit ? allowed : allowed.slice(0, limit);
}

export type ActivationOptions = {
  /** Days of access this payment buys. */
  periodDays?: number;
  provider?: PaymentProvider;
  /** Skip the credit grant — used when replaying provisioning. */
  grantCredits?: boolean;
  actorId?: string | null;
  detail?: string;
};

/**
 * Puts a workspace on a plan and starts (or extends) its paid period.
 *
 * The single point at which a workspace becomes ACTIVE. Applies the plan's
 * limits — including `countryLimit`, which the previous implementation never
 * touched, so a workspace that upgraded from Starter to Fleet kept its
 * one-country cap and silently got nothing for the extra $60.
 */
export async function activateMembership(
  workspaceId: string,
  plan: BillingPlan,
  options: ActivationOptions = {},
) {
  const limits = planLimits(plan);
  const periodDays = options.periodDays ?? BILLING_PERIOD_DAYS;

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        currentPeriodEnd: true,
        trialEndsAt: true,
        allowedCountries: true,
        creditBalance: true,
      },
    });
    if (!workspace) throw new Error(`Workspace ${workspaceId} not found`);

    // Time already granted, whichever form it took. A workspace on trial has
    // no `currentPeriodEnd` — registration sets only `trialEndsAt` — so
    // basing the new period on `currentPeriodEnd` alone confiscated the unused
    // trial days from anyone who subscribed before their trial ran out, which
    // is precisely the customer you least want to short-change. Same rule the
    // renewal sweep uses to decide when access lapses.
    const grantedUntil =
      workspace.currentPeriodEnd && workspace.trialEndsAt
        ? workspace.currentPeriodEnd > workspace.trialEndsAt
          ? workspace.currentPeriodEnd
          : workspace.trialEndsAt
        : (workspace.currentPeriodEnd ?? workspace.trialEndsAt);

    const periodEnd = nextPeriodEnd(grantedUntil, periodDays);

    const data: Prisma.WorkspaceUpdateInput = {
      plan,
      billingStatus: "ACTIVE",
      currentPeriodEnd: periodEnd,
      vesselLimit: limits.vesselLimit,
      emailLimit: limits.emailLimit,
      inboxLimit: limits.inboxLimit,
      teamLimit: limits.teamLimit,
      countryLimit: limits.countryLimit,
      // Clear the lifecycle marks — this workspace is current again, and a
      // stale reminder timestamp would suppress the next cycle's reminder.
      lastRenewalReminderAt: null,
      downgradedAt: null,
      // The trial is over once money has changed hands. Leaving it set makes
      // the UI keep advertising "trial ends in N days" to a paying customer.
      trialEndsAt: null,
    };
    if (options.provider) data.paymentProvider = options.provider;

    // An upgrade widens the country cap but never auto-grants countries — the
    // customer picks which ones. A downgrade must trim, or the country-scope
    // check would keep serving countries the new plan doesn't include.
    const trimmed = trimCountries(workspace.allowedCountries, limits.countryLimit);
    if (trimmed.length !== workspace.allowedCountries.length) {
      data.allowedCountries = trimmed;
    }

    if (options.grantCredits !== false) {
      data.creditBalance = { increment: limits.monthlyCredits };
    }

    const updated = await tx.workspace.update({ where: { id: workspaceId }, data });

    if (options.grantCredits !== false) {
      await tx.creditLedger.create({
        data: {
          workspaceId,
          delta: limits.monthlyCredits,
          balance: updated.creditBalance,
          reason: "PLAN_REPLENISH",
          detail: options.detail ?? `${PLANS[plan].label} plan — ${periodDays} days`,
          actorId: options.actorId ?? null,
        },
      });
    }

    return updated;
  });
}

/**
 * Reduces a lapsed workspace to the free floor.
 *
 * Not a deletion: data stays, limits narrow. Dropping to STARTER's caps means
 * an over-limit workspace stops being able to ADD more, while everything it
 * already has remains readable — losing a customer's data because an invoice
 * went unpaid for six days would be indefensible.
 */
export async function downgradeToFree(workspaceId: string, reason: string) {
  const limits = planLimits("STARTER");
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { allowedCountries: true },
    });
    if (!workspace) return null;

    return tx.workspace.update({
      where: { id: workspaceId },
      data: {
        plan: "STARTER",
        billingStatus: "CANCELED",
        vesselLimit: limits.vesselLimit,
        emailLimit: limits.emailLimit,
        inboxLimit: limits.inboxLimit,
        teamLimit: limits.teamLimit,
        countryLimit: limits.countryLimit,
        allowedCountries: trimCountries(workspace.allowedCountries, limits.countryLimit),
        downgradedAt: new Date(),
        // Credits are NOT clawed back. They were paid for or granted; taking
        // them back on a lapse would be taking something already bought.
      },
    });
  }).then(async (result) => {
    if (result) {
      console.log(`[membership] downgraded workspace ${workspaceId} to free: ${reason}`);
    }
    return result;
  });
}

export type MembershipView = SharedMembershipView;

/**
 * Derives what the UI should say about a workspace's membership.
 *
 * Re-exported from `@marimail/utils/plans` — that copy is now the ONE
 * definition, so this and the Next.js billing page and the dashboard shell
 * can't drift on the grace-period math. Kept as a named export here so
 * existing importers (`routes/billing.ts`, `sending-readiness.ts`) don't need
 * to change their import path.
 */
export function describeMembership(workspace: {
  plan: BillingPlan;
  billingStatus: string;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
}): MembershipView {
  return sharedDescribeMembership(workspace);
}

import { notFound } from "next/navigation";
import { prisma } from "@marimail/db";
import {
  CREDIT_PACKS as SHARED_CREDIT_PACKS,
  GRACE_PERIOD_DAYS,
  PLANS,
  PLAN_ORDER,
  type PlanKey,
} from "@marimail/utils/plans";
import { getServerSession } from "@/lib/api";

/**
 * Plan and pack data are re-exported from `@marimail/utils/plans`. They used to
 * be a hand-maintained copy here that had drifted to $49/$99/$249 — a fourth
 * disagreeing price list, and the one the billing page rendered. Charging a
 * customer one number while showing them another is the failure this
 * consolidation exists to prevent.
 */
export const PLAN_CATALOG = PLAN_ORDER.map((key) => PLANS[key]);
export const CREDIT_PACKS = SHARED_CREDIT_PACKS;
export { GRACE_PERIOD_DAYS };

export async function requireBillingWorkspace() {
  const session = await getServerSession();
  if (!session?.activeWorkspace) notFound();
  return {
    workspaceId: session.activeWorkspace.id,
    userId: session.user.id,
    userName: session.user.name ?? "",
    userEmail: session.user.email,
    workspaceName: session.activeWorkspace.name,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type MembershipView = {
  plan: PlanKey;
  status: string;
  active: boolean;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  daysRemaining: number | null;
  inGracePeriod: boolean;
};

/**
 * Mirrors `describeMembership` on the server.
 *
 * Duplicated rather than imported because the server copy pulls in Prisma
 * enums and service code that Next's bundler shouldn't drag into a page. The
 * shared constants it depends on (grace period, day length) do come from the
 * one catalog, so the two cannot disagree about the rule that matters.
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
    active: workspace.billingStatus !== "CANCELED" && (!expired || inGracePeriod),
    trialEndsAt: workspace.trialEndsAt,
    currentPeriodEnd: workspace.currentPeriodEnd,
    daysRemaining,
    inGracePeriod,
  };
}

export async function getBillingOverview(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      plan: true,
      billingStatus: true,
      creditBalance: true,
      currentPeriodEnd: true,
      vesselLimit: true,
      emailLimit: true,
      inboxLimit: true,
      teamLimit: true,
      countryLimit: true,
      allowedCountries: true,
      stripeCustomerId: true,
      paymentProvider: true,
      trialEndsAt: true,
    },
  });
  if (!workspace) notFound();

  const sinceMonth = new Date();
  sinceMonth.setUTCDate(1);
  sinceMonth.setUTCHours(0, 0, 0, 0);

  const [vessels, emails, inboxes, seats, ledger, payments] = await Promise.all([
    prisma.vessel.count({ where: { workspaceId } }),
    prisma.emailEvent.count({
      where: { workspaceId, eventType: "SENT", occurredAt: { gte: sinceMonth } },
    }),
    prisma.emailAccount.count({ where: { workspaceId } }),
    prisma.workspaceMember.count({ where: { workspaceId } }),
    prisma.creditLedger.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.payment.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        provider: true,
        status: true,
        purpose: true,
        amountCents: true,
        currency: true,
        grantPlan: true,
        grantCredits: true,
        failureReason: true,
        paidAt: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    workspace,
    membership: describeMembership(workspace),
    usage: { vessels, emails, inboxes, seats },
    ledger,
    payments,
  };
}

import { notFound } from "next/navigation";
import { prisma } from "@marimail/db";
import {
  CREDIT_PACKS as SHARED_CREDIT_PACKS,
  GRACE_PERIOD_DAYS,
  PLANS,
  PLAN_ORDER,
  describeMembership,
  type MembershipView,
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

// `describeMembership` and its `MembershipView` type are re-exported from
// `@marimail/utils/plans` — that is now the ONE definition. It used to be
// copied here on the theory that the server copy dragged in Prisma; it never
// did (only the *file* it lived in did), and now that the function lives in
// the dependency-free plans module there is nothing to avoid.
export { describeMembership, type MembershipView };

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

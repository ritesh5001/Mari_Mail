import { prisma, type BillingPlan, type BillingStatus, type Workspace, Prisma } from "@marimail/db";
import {
  CREDIT_COST as SHARED_CREDIT_COST,
  CREDIT_PACKS,
  PLANS,
  planLimits as sharedPlanLimits,
  type PlanDefinition as SharedPlanDefinition,
} from "@marimail/utils/plans";

/**
 * Plan data now lives in `@marimail/utils/plans` so the marketing page, the
 * signup picker, this service and both payment gateways cannot disagree about
 * what a plan costs. The catalog below is a re-export kept for the existing
 * call sites; new code should import from the shared module directly.
 */
export type PlanDefinition = SharedPlanDefinition;

export const PLAN_CATALOG: Record<BillingPlan, PlanDefinition> = PLANS;

export const CREDIT_PACK_CATALOG = CREDIT_PACKS;

/**
 * Moved to `@marimail/utils/plans` for the same reason the plan catalog was:
 * the Credits page quotes these prices to the customer, and only one copy may
 * exist. Re-exported so existing call sites keep working.
 */
export const CREDIT_COST = SHARED_CREDIT_COST;

export function waterfallEmailCost(contactCount: number): number {
  return Math.max(0, Math.trunc(contactCount)) * CREDIT_COST.WATERFALL_EMAIL;
}

export function planLimits(plan: BillingPlan) {
  return sharedPlanLimits(plan);
}

export async function applyPlanToWorkspace(workspaceId: string, plan: BillingPlan, options?: { stripeCustomerId?: string; stripeSubscriptionId?: string; stripePriceId?: string; currentPeriodEnd?: Date; billingStatus?: BillingStatus; replenishCredits?: boolean; actorId?: string | null }) {
  const limits = planLimits(plan);
  const data: Prisma.WorkspaceUpdateInput = {
    plan,
    vesselLimit: limits.vesselLimit,
    emailLimit: limits.emailLimit,
    inboxLimit: limits.inboxLimit,
    teamLimit: limits.teamLimit,
  };
  if (options?.stripeCustomerId) data.stripeCustomerId = options.stripeCustomerId;
  if (options?.stripeSubscriptionId) data.stripeSubscriptionId = options.stripeSubscriptionId;
  if (options?.stripePriceId) data.stripePriceId = options.stripePriceId;
  if (options?.currentPeriodEnd) data.currentPeriodEnd = options.currentPeriodEnd;
  if (options?.billingStatus) data.billingStatus = options.billingStatus;

  if (options?.replenishCredits !== false) {
    data.creditBalance = { increment: limits.monthlyCredits };
  }

  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data,
  });

  if (options?.replenishCredits !== false) {
    await prisma.creditLedger.create({
      data: {
        workspaceId,
        delta: limits.monthlyCredits,
        balance: workspace.creditBalance,
        reason: "PLAN_REPLENISH",
        detail: `Plan ${plan} replenish`,
        actorId: options?.actorId ?? null,
      },
    });
  }

  return workspace;
}

export async function grantCredits(workspaceId: string, credits: number, reason: "ADD_ON_PURCHASE" | "ADMIN_GRANT" | "REFUND" | "ADJUSTMENT", detail?: string, actorId?: string | null) {
  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { creditBalance: { increment: credits } },
  });
  await prisma.creditLedger.create({
    data: {
      workspaceId,
      delta: credits,
      balance: workspace.creditBalance,
      reason,
      detail,
      actorId: actorId ?? null,
    },
  });
  return workspace.creditBalance;
}

export class CreditDeductionError extends Error {
  constructor(public required: number, public available: number) {
    super(`Insufficient credits: need ${required}, have ${available}`);
  }
}

/**
 * Raised when a workspace has the credits but not the right to spend them.
 *
 * Credits are an asset the customer bought; a lapsed subscription is a lack of
 * access, not a forfeiture. So the balance is never touched when a membership
 * ends — the spend is refused instead, and the moment they subscribe again the
 * same balance is spendable, with that period's allowance added on top.
 */
export class MembershipInactiveError extends Error {
  constructor(
    public billingStatus: BillingStatus,
    public creditBalance: number,
  ) {
    super("Your subscription has ended. Your credits are safe — renew to start using them again.");
  }
}

/**
 * Which billing states may spend credits.
 *
 * PAST_DUE is deliberately included: it is the grace window for a declined
 * card or a slow finance team, and the membership lifecycle treats it as a
 * working state everywhere else. Only CANCELED — or a workspace the sweep has
 * actually downgraded — loses the ability to spend.
 */
const SPENDING_STATUSES: BillingStatus[] = ["ACTIVE", "TRIALING", "PAST_DUE"];

export function canSpendCredits(workspace: Pick<Workspace, "billingStatus" | "downgradedAt">) {
  return SPENDING_STATUSES.includes(workspace.billingStatus) && workspace.downgradedAt === null;
}

export async function deductCredits(workspaceId: string, credits: number, reason: "VIEW_VESSEL" | "SAVE_VESSEL" | "EXPORT_VESSEL" | "REVEAL_EMAIL" | "REVEAL_PHONE" | "WATERFALL_EMAIL", detail?: string, actorId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({
      where: { id: workspaceId },
      select: { creditBalance: true, billingStatus: true, downgradedAt: true },
    });
    if (!workspace) throw new CreditDeductionError(credits, 0);
    // Checked inside the transaction, alongside the balance, so a membership
    // that lapses mid-request can't be raced by a concurrent reveal.
    if (!canSpendCredits(workspace)) {
      throw new MembershipInactiveError(workspace.billingStatus, workspace.creditBalance);
    }
    if (workspace.creditBalance < credits) throw new CreditDeductionError(credits, workspace.creditBalance);
    const updated = await tx.workspace.update({
      where: { id: workspaceId },
      data: { creditBalance: { decrement: credits } },
      select: { creditBalance: true },
    });
    await tx.creditLedger.create({
      data: {
        workspaceId,
        delta: -credits,
        balance: updated.creditBalance,
        reason,
        detail,
        actorId: actorId ?? null,
      },
    });
    return updated.creditBalance;
  });
}

export function enforceVesselLimit(workspace: Pick<Workspace, "vesselLimit">, currentCount: number) {
  return currentCount < workspace.vesselLimit;
}

export function enforceEmailLimit(workspace: Pick<Workspace, "emailLimit">, monthlySentCount: number) {
  return monthlySentCount < workspace.emailLimit;
}

type StripeInstance = InstanceType<typeof import("stripe").Stripe>;
let stripeClient: StripeInstance | null = null;
let stripeChecked = false;

export async function getStripe(): Promise<StripeInstance | null> {
  if (stripeChecked) return stripeClient;
  stripeChecked = true;
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) return null;
  const { Stripe } = await import("stripe");
  stripeClient = new Stripe(apiKey);
  return stripeClient;
}

export type PortalPayload = { url: string };

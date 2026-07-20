import { prisma, type BillingPlan, type BillingStatus, type Workspace, Prisma } from "@marimail/db";

export type PlanDefinition = {
  plan: BillingPlan;
  label: string;
  priceUsd: number;
  vesselLimit: number;
  emailLimit: number;
  inboxLimit: number;
  teamLimit: number;
  monthlyCredits: number;
  features: string[];
  stripePriceEnvVar?: string;
};

export const PLAN_CATALOG: Record<BillingPlan, PlanDefinition> = {
  STARTER: {
    plan: "STARTER",
    label: "Starter",
    priceUsd: 49,
    vesselLimit: 50,
    emailLimit: 5_000,
    inboxLimit: 1,
    teamLimit: 1,
    monthlyCredits: 500,
    features: ["50 vessels", "5,000 emails/month", "5 ETA campaigns", "1 inbox", "1 seat", "500 DB credits"],
    stripePriceEnvVar: "STRIPE_PRICE_STARTER",
  },
  PRO: {
    plan: "PRO",
    label: "Pro",
    priceUsd: 99,
    vesselLimit: 250,
    emailLimit: 25_000,
    inboxLimit: 5,
    teamLimit: 5,
    monthlyCredits: 2_500,
    features: ["250 vessels", "25,000 emails/month", "Unlimited ETA campaigns", "5 inboxes", "5 seats", "2,500 DB credits"],
    stripePriceEnvVar: "STRIPE_PRICE_PRO",
  },
  BUSINESS: {
    plan: "BUSINESS",
    label: "Business",
    priceUsd: 249,
    vesselLimit: 1_000,
    emailLimit: 100_000,
    inboxLimit: 20,
    teamLimit: 20,
    monthlyCredits: 10_000,
    features: ["1,000 vessels", "100,000 emails/month", "Unlimited ETA campaigns", "20 inboxes", "20 seats", "10,000 DB credits"],
    stripePriceEnvVar: "STRIPE_PRICE_BUSINESS",
  },
  ENTERPRISE: {
    plan: "ENTERPRISE",
    label: "Enterprise",
    priceUsd: 0,
    vesselLimit: 1_000_000_000,
    emailLimit: 1_000_000_000,
    inboxLimit: 1_000,
    teamLimit: 1_000,
    monthlyCredits: 1_000_000,
    features: ["Unlimited vessels", "Unlimited emails", "Unlimited seats", "Custom integrations", "API access"],
    stripePriceEnvVar: "STRIPE_PRICE_ENTERPRISE",
  },
};

export const CREDIT_PACK_CATALOG = [
  { packKey: "1000", credits: 1_000, priceUsd: 19, stripePriceEnvVar: "STRIPE_PRICE_CREDITS_1K" },
  { packKey: "5000", credits: 5_000, priceUsd: 79, stripePriceEnvVar: "STRIPE_PRICE_CREDITS_5K" },
  { packKey: "20000", credits: 20_000, priceUsd: 249, stripePriceEnvVar: "STRIPE_PRICE_CREDITS_20K" },
] as const;

export const CREDIT_COST = {
  VIEW_VESSEL: 1,
  SAVE_VESSEL: 3,
  EXPORT_VESSEL: 2,
} as const;

export function planLimits(plan: BillingPlan) {
  const def = PLAN_CATALOG[plan];
  return {
    vesselLimit: def.vesselLimit,
    emailLimit: def.emailLimit,
    inboxLimit: def.inboxLimit,
    teamLimit: def.teamLimit,
    monthlyCredits: def.monthlyCredits,
  };
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

export async function deductCredits(workspaceId: string, credits: number, reason: "VIEW_VESSEL" | "SAVE_VESSEL" | "EXPORT_VESSEL" | "REVEAL_EMAIL" | "REVEAL_PHONE", detail?: string, actorId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.findUnique({ where: { id: workspaceId }, select: { creditBalance: true } });
    if (!workspace) throw new CreditDeductionError(credits, 0);
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

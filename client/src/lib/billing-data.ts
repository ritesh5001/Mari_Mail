import { notFound } from "next/navigation";
import { prisma } from "@marimail/db";
import { getServerSession } from "@/lib/api";

export const PLAN_CATALOG = [
  { plan: "STARTER" as const, label: "Starter", priceUsd: 49, vesselLimit: 50, emailLimit: 5_000, teamLimit: 1, monthlyCredits: 500, features: ["50 vessels", "5,000 emails/month", "5 ETA campaigns", "1 seat", "500 DB credits"] },
  { plan: "PRO" as const, label: "Pro", priceUsd: 99, vesselLimit: 250, emailLimit: 25_000, teamLimit: 5, monthlyCredits: 2_500, features: ["250 vessels", "25,000 emails/month", "Unlimited ETA campaigns", "5 seats", "2,500 DB credits"] },
  { plan: "BUSINESS" as const, label: "Business", priceUsd: 249, vesselLimit: 1_000, emailLimit: 100_000, teamLimit: 20, monthlyCredits: 10_000, features: ["1,000 vessels", "100,000 emails/month", "20 seats", "10,000 DB credits"] },
  { plan: "ENTERPRISE" as const, label: "Enterprise", priceUsd: 0, vesselLimit: 1_000_000_000, emailLimit: 1_000_000_000, teamLimit: 1_000, monthlyCredits: 1_000_000, features: ["Unlimited vessels", "Unlimited emails", "Unlimited seats", "API access"] },
];

export const CREDIT_PACKS = [
  { packKey: "1000" as const, credits: 1_000, priceUsd: 19 },
  { packKey: "5000" as const, credits: 5_000, priceUsd: 79 },
  { packKey: "20000" as const, credits: 20_000, priceUsd: 249 },
];

export async function requireBillingWorkspace() {
  const session = await getServerSession();
  if (!session?.activeWorkspace) notFound();
  return { workspaceId: session.activeWorkspace.id, userId: session.user.id, workspaceName: session.activeWorkspace.name };
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
      teamLimit: true,
      stripeCustomerId: true,
      trialEndsAt: true,
    },
  });
  if (!workspace) notFound();

  const sinceMonth = new Date();
  sinceMonth.setUTCDate(1);
  sinceMonth.setUTCHours(0, 0, 0, 0);
  const [vessels, emails, ledger] = await Promise.all([
    prisma.vessel.count({ where: { workspaceId } }),
    prisma.emailEvent.count({ where: { workspaceId, eventType: "SENT", occurredAt: { gte: sinceMonth } } }),
    prisma.creditLedger.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 25 }),
  ]);

  return { workspace, usage: { vessels, emails }, ledger };
}

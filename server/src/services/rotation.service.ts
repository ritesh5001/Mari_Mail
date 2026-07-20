import { prisma, type EmailAccount } from "@marimail/db";
import { getTodaySent } from "./email-account.service.js";
import { incrementToken } from "./token-store.js";

export type RotationStrategy = "ROUND_ROBIN" | "WEIGHTED" | "LEAST_USED";
type Candidate = EmailAccount & { sentToday: number };

function available(candidates: Candidate[]) {
  return candidates.filter((account) => account.sentToday < account.dailyLimit);
}

function weightedPool(candidates: Candidate[]) {
  return candidates.flatMap((account) => Array.from({ length: Math.max(account.rotationWeight, 1) }, () => account));
}

export async function selectEmailAccount(
  workspaceId: string,
  accountIds: string[] | undefined,
  strategy: RotationStrategy = "ROUND_ROBIN",
) {
  const accounts = await prisma.emailAccount.findMany({
    where: {
      workspaceId,
      status: { in: ["ACTIVE", "WARMING"] },
      id: accountIds?.length ? { in: accountIds } : undefined,
    },
    orderBy: { createdAt: "asc" },
  });

  const candidates: Candidate[] = await Promise.all(
    accounts.map(async (account) => ({ ...account, sentToday: await getTodaySent(account.id) })),
  );
  const active = available(candidates);
  if (!active.length) {
    return null;
  }

  if (strategy === "LEAST_USED") {
    return active.sort((a, b) => a.sentToday - b.sentToday || b.healthScore - a.healthScore)[0] ?? null;
  }

  const pool = strategy === "WEIGHTED" ? weightedPool(active) : active;
  const key = `workspace:${workspaceId}:rotation:${strategy}`;
  const value = await incrementToken(key, 36 * 60 * 60);
  const next = (value - 1) % pool.length;
  return pool[next] ?? active[0] ?? null;
}

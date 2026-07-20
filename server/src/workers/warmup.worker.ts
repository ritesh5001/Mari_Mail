import { prisma } from "@marimail/db";
import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { workerOptionsFor } from "./shared-worker-options.js";

type WarmupJobData = {
  accountId?: string;
};

function startOfUtcDay(date = new Date()) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function rampTarget(day: number) {
  const start = 5;
  const max = 50;
  const growth = Math.pow(max / start, 1 / 29);
  return Math.min(max, Math.max(start, Math.round(start * Math.pow(growth, Math.max(day - 1, 0)))));
}

async function processAccount(accountId: string) {
  const account = await prisma.emailAccount.findUnique({ where: { id: accountId } });
  if (!account || !account.warmupEnabled || account.status === "PAUSED") {
    return null;
  }

  const today = startOfUtcDay();
  const target = rampTarget(account.warmupDay);
  const healthScore = Math.min(
    100,
    account.healthScore + (account.spfOk ? 5 : 0) + (account.dkimOk ? 5 : 0) + (account.dmarcOk ? 5 : 0),
  );

  const log = await prisma.warmupLog.upsert({
    where: { accountId_date: { accountId: account.id, date: today } },
    update: {
      sentCount: target,
      healthScore,
    },
    create: {
      accountId: account.id,
      date: today,
      sentCount: target,
      healthScore,
    },
  });

  await prisma.emailAccount.update({
    where: { id: account.id },
    data: {
      dailyLimit: Math.max(account.dailyLimit, target),
      warmupDay: { increment: 1 },
      status: account.warmupDay >= 30 ? "ACTIVE" : "WARMING",
      healthScore,
    },
  });

  return log;
}

export function startWarmupWorker(connection: Redis) {
  return new Worker<WarmupJobData>(
    "warmup",
    async (job: Job<WarmupJobData>) => {
      if (job.data.accountId) {
        return processAccount(job.data.accountId);
      }

      const accounts = await prisma.emailAccount.findMany({
        where: {
          warmupEnabled: true,
          status: { in: ["ACTIVE", "WARMING"] },
        },
        select: { id: true },
      });

      const logs = [];
      for (const account of accounts) {
        logs.push(await processAccount(account.id));
      }
      return logs.filter(Boolean);
    },
    workerOptionsFor(connection),
  );
}

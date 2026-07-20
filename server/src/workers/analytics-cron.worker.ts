import { Queue, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { recomputeEngagementScores } from "../services/engagement-scoring.service.js";
import { sendWeeklyDigests } from "../services/digest.service.js";
import { workerOptionsFor } from "./shared-worker-options.js";

const QUEUE_NAME = "analytics-cron";

type CronJobName = "engagement-score" | "weekly-digest";

export async function registerAnalyticsCrons(connection: Redis) {
  const queue = new Queue<Record<string, never>, void, CronJobName>(QUEUE_NAME, { connection });

  await queue.add(
    "engagement-score",
    {},
    {
      jobId: "engagement-score",
      repeat: { pattern: "0 2 * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  await queue.add(
    "weekly-digest",
    {},
    {
      jobId: "weekly-digest",
      repeat: { pattern: "0 9 * * 1" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  return queue;
}

export function startAnalyticsCronWorker(connection: Redis) {
  return new Worker<Record<string, never>, { ok: boolean; detail?: unknown }, CronJobName>(
    QUEUE_NAME,
    async (job: Job<Record<string, never>, { ok: boolean; detail?: unknown }, CronJobName>) => {
      if (job.name === "engagement-score") {
        const result = await recomputeEngagementScores();
        return { ok: true, detail: result };
      }
      if (job.name === "weekly-digest") {
        const result = await sendWeeklyDigests();
        return { ok: true, detail: result };
      }
      return { ok: false };
    },
    workerOptionsFor(connection, { concurrency: 1 }),
  );
}

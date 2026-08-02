import { Queue, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { recomputeEngagementScores } from "../services/engagement-scoring.service.js";
import { sendWeeklyDigests } from "../services/digest.service.js";
import { sweepMemberships } from "../services/membership-sweep.service.js";
import { runAllApolloDrips } from "../services/apollo-drip.service.js";
import { workerOptionsFor } from "./shared-worker-options.js";

const QUEUE_NAME = "analytics-cron";

type CronJobName = "engagement-score" | "weekly-digest" | "membership-sweep" | "apollo-drip";

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

  // Membership lifecycle: renewal reminders, past-due transitions and
  // post-grace downgrades. Hourly rather than daily so a workspace that renews
  // mid-morning isn't told it lapsed, and so a missed run costs an hour rather
  // than a day. Every step is idempotent, so extra runs are free.
  await queue.add(
    "membership-sweep",
    {},
    {
      jobId: "membership-sweep",
      repeat: { pattern: "15 * * * *" },
      removeOnComplete: true,
      removeOnFail: false,
    },
  );

  // Apollo drips: reveal the next `dailyLimit` people from each saved filter
  // and append them to its list. 07:00 UTC so a day's contacts are in place
  // before anyone starts a campaign against the list. One run per day is the
  // whole point — the cap is what keeps credit spend predictable.
  await queue.add(
    "apollo-drip",
    {},
    {
      jobId: "apollo-drip",
      repeat: { pattern: "0 7 * * *" },
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
      if (job.name === "membership-sweep") {
        const result = await sweepMemberships();
        return { ok: true, detail: result };
      }
      if (job.name === "engagement-score") {
        const result = await recomputeEngagementScores();
        return { ok: true, detail: result };
      }
      if (job.name === "apollo-drip") {
        const result = await runAllApolloDrips();
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

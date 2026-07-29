import { Redis } from "ioredis";
import { registerAnalyticsCrons, startAnalyticsCronWorker } from "./workers/analytics-cron.worker.js";
import { startCampaignSchedulerWorker } from "./workers/campaign-scheduler.worker.js";
import { startManualSchedulerWorker } from "./workers/campaign-manual-scheduler.worker.js";
import { startCsvImportWorker } from "./workers/csv-import.worker.js";
import { requeueStalledCsvImports } from "./services/csv-import-queue.js";
import { startWarmupWorker } from "./workers/warmup.worker.js";
import { installRedisQuotaGuard, isQuotaError } from "./workers/redis-quota-guard.js";

export function startBackendWorkers() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("Skipping backend workers because REDIS_URL is not set.");
    return null;
  }
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  // Connection-level errors are handled by the quota guard below (it owns the
  // `error` listener so a quota flood is logged once, not per command). We
  // still attach a no-op here so an early error before the guard installs
  // can't crash the process as an unhandled 'error' event.
  connection.on("error", () => undefined);

  // Note: we used to open a QueueEvents subscription per queue here purely for
  // logging failures, but each subscription holds a persistent Redis reader
  // that polls streams — 7 of them together were burning tens of thousands of
  // Upstash requests per day. The individual Worker instances below already
  // emit their own `failed` events for logging, so the QueueEvents fan-out is
  // pure overhead. Remove them entirely.

  // Quota errors are handled centrally by the guard (logged once, workers
  // paused); the per-job `failed` handlers skip them so they don't re-spam
  // the log with the same `max requests limit exceeded` for every job.
  const warmupWorker = startWarmupWorker(connection);
  warmupWorker.on("failed", (job, error) => {
    if (isQuotaError(error)) return;
    console.error(`warmup worker job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });

  const campaignSchedulerWorker = startCampaignSchedulerWorker(connection);
  campaignSchedulerWorker.on("failed", (job, error) => {
    if (isQuotaError(error)) return;
    console.error(`eta-step worker job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });

  const manualSchedulerWorker = startManualSchedulerWorker(connection);
  manualSchedulerWorker.on("failed", (job, error) => {
    if (isQuotaError(error)) return;
    console.error(`manual-step worker job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });

  const analyticsCronWorker = startAnalyticsCronWorker(connection);
  analyticsCronWorker.on("failed", (job, error) => {
    if (isQuotaError(error)) return;
    console.error(`analytics-cron worker job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });

  const csvImportWorker = startCsvImportWorker(connection);
  csvImportWorker.on("failed", (job, error) => {
    if (isQuotaError(error)) return;
    console.error(`csv-import worker job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });

  // Graceful degradation when Upstash's request quota is exhausted: pause
  // every worker (stops the doomed poll loop + the ReplyError log flood) and
  // auto-resume once the quota recovers. Without this the process spams
  // identical `max requests limit exceeded` stacks several times a second.
  installRedisQuotaGuard(connection, [
    warmupWorker,
    campaignSchedulerWorker,
    manualSchedulerWorker,
    analyticsCronWorker,
    csvImportWorker,
  ]);

  // Recover imports orphaned in `active` by a previous run. BullMQ's own
  // stalled checker only runs inside a live, unpaused worker, so it cannot
  // recover the case where nothing was running at all — which is exactly the
  // case a restart is fixing.
  requeueStalledCsvImports().catch((error) => {
    if (isQuotaError(error)) return;
    console.error(`Failed to requeue stalled CSV imports: ${error.message}`);
  });

  registerAnalyticsCrons(connection).catch((error) => {
    if (isQuotaError(error)) return; // guard already logged + paused
    console.error(`Failed to register analytics crons: ${error.message}`);
  });

  console.log("MariMail backend workers registered in the server process.");
  return { connection, warmupWorker, campaignSchedulerWorker, manualSchedulerWorker, analyticsCronWorker, csvImportWorker };
}

if (process.argv[1]?.endsWith("worker.ts") || process.argv[1]?.endsWith("worker.js")) {
  startBackendWorkers();
}

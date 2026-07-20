import { Redis } from "ioredis";
import { registerAnalyticsCrons, startAnalyticsCronWorker } from "./workers/analytics-cron.worker.js";
import { startCampaignSchedulerWorker } from "./workers/campaign-scheduler.worker.js";
import { startManualSchedulerWorker } from "./workers/campaign-manual-scheduler.worker.js";
import { startCsvImportWorker } from "./workers/csv-import.worker.js";
import { startWarmupWorker } from "./workers/warmup.worker.js";

export function startBackendWorkers() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.log("Skipping backend workers because REDIS_URL is not set.");
    return null;
  }
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  connection.on("error", (error) => {
    console.error(`Redis worker connection error: ${error.message}`);
  });

  // Note: we used to open a QueueEvents subscription per queue here purely for
  // logging failures, but each subscription holds a persistent Redis reader
  // that polls streams — 7 of them together were burning tens of thousands of
  // Upstash requests per day. The individual Worker instances below already
  // emit their own `failed` events for logging, so the QueueEvents fan-out is
  // pure overhead. Remove them entirely.

  const warmupWorker = startWarmupWorker(connection);
  warmupWorker.on("failed", (job, error) => {
    console.error(`warmup worker job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });

  const campaignSchedulerWorker = startCampaignSchedulerWorker(connection);
  campaignSchedulerWorker.on("failed", (job, error) => {
    console.error(`eta-step worker job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });

  const manualSchedulerWorker = startManualSchedulerWorker(connection);
  manualSchedulerWorker.on("failed", (job, error) => {
    console.error(`manual-step worker job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });

  const analyticsCronWorker = startAnalyticsCronWorker(connection);
  analyticsCronWorker.on("failed", (job, error) => {
    console.error(`analytics-cron worker job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });

  const csvImportWorker = startCsvImportWorker(connection);
  csvImportWorker.on("failed", (job, error) => {
    console.error(`csv-import worker job ${job?.id ?? "unknown"} failed: ${error.message}`);
  });

  registerAnalyticsCrons(connection).catch((error) => {
    console.error(`Failed to register analytics crons: ${error.message}`);
  });

  console.log("MariMail backend workers registered in the server process.");
  return { connection, warmupWorker, campaignSchedulerWorker, manualSchedulerWorker, analyticsCronWorker, csvImportWorker };
}

if (process.argv[1]?.endsWith("worker.ts") || process.argv[1]?.endsWith("worker.js")) {
  startBackendWorkers();
}

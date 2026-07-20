import { Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { emitWorkspaceEvent } from "../services/realtime.js";
import type { CsvImportJobData, CsvImportJobResult } from "../services/csv-import-queue.js";
import { processCsvImport } from "../routes/imports.js";
import { workerOptionsFor } from "./shared-worker-options.js";

export function startCsvImportWorker(connection: Redis) {
  return new Worker<CsvImportJobData, CsvImportJobResult>(
    "csv-import",
    async (job: Job<CsvImportJobData>) => {
      emitWorkspaceEvent(job.data.workspaceId, "import:queued", {
        jobId: job.id,
        importType: job.data.importType,
      });
      const result = await processCsvImport(job.data, job.data.workspaceId, job.data.userId);
      emitWorkspaceEvent(job.data.workspaceId, "import:job-complete", {
        jobId: job.id,
        ...result,
      });
      return result;
    },
    workerOptionsFor(connection, { concurrency: 1 }),
  );
}


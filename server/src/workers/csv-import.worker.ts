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
      const result = await processCsvImport(
        job.data,
        job.data.workspaceId,
        job.data.userId,
        // Two sinks, deliberately. The socket event drives the live page for
        // whoever has it open right now; the job's own progress is what a page
        // opened LATER — or reloaded mid-import — reads back. Without the
        // persisted half, refreshing during a long import showed a running job
        // with no indication of how far along it was.
        (done, total) => {
          void job.updateProgress({ done, total }).catch(() => undefined);
          emitWorkspaceEvent(job.data.workspaceId, "import:progress", {
            jobId: job.id,
            done,
            total,
          });
        },
      );
      emitWorkspaceEvent(job.data.workspaceId, "import:job-complete", {
        jobId: job.id,
        ...result,
      });
      return result;
    },
    // A 60s stalled check instead of the shared 300s default. With
    // `concurrency: 1`, one job orphaned in `active` by a crash or a restart
    // blocks every import queued behind it, so five minutes of dead air is too
    // long to wait — and at ~1.4k extra Redis commands a day this is the one
    // worker where that trade is clearly worth it.
    workerOptionsFor(connection, { concurrency: 1, stalledInterval: 60_000 }),
  );
}


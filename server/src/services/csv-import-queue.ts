import { Queue, Job } from "bullmq";
import { Redis } from "ioredis";

export type CsvImportType =
  | "MARINE_DATA_ROWS"
  | "VESSELS"
  | "SHIP_OWNER_COMPANIES"
  | "ISM_MANAGER_COMPANIES"
  | "COMMERCIAL_MANAGER_COMPANIES"
  | "CONTACTS"
  | "VESSEL_ETAS";

export type CsvImportJobData = {
  importType: CsvImportType;
  csv: string;
  mapping?: Record<string, string>;
  workspaceId: string;
  userId: string;
};

export type CsvImportJobResult = {
  created: number;
  updated?: number;
  errors: Array<{ row: number; message: string }>;
};

const QUEUE_NAME = "csv-import";
let connection: Redis | null | undefined;
let queue: Queue<CsvImportJobData, CsvImportJobResult> | null | undefined;

function getConnection() {
  if (connection !== undefined) return connection;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    connection = null;
    return null;
  }
  connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  connection.on("error", (error) => {
    console.error(`CSV import Redis connection error: ${error.message}`);
  });
  return connection;
}

export function getCsvImportQueue() {
  if (queue !== undefined) return queue;
  const redis = getConnection();
  if (!redis) {
    queue = null;
    return null;
  }
  queue = new Queue<CsvImportJobData, CsvImportJobResult>(QUEUE_NAME, { connection: redis });
  return queue;
}

export async function enqueueCsvImport(data: CsvImportJobData) {
  const csvQueue = getCsvImportQueue();
  if (!csvQueue) return null;
  return csvQueue.add("csv-import", data, {
    attempts: 1,
    removeOnComplete: { age: 60 * 60 * 24 * 7, count: 1000 },
    removeOnFail: { age: 60 * 60 * 24 * 14, count: 1000 },
  });
}

export async function getCsvImportJob(jobId: string) {
  const csvQueue = getCsvImportQueue();
  if (!csvQueue) return null;
  return Job.fromId<CsvImportJobData, CsvImportJobResult>(csvQueue, jobId);
}

/**
 * Re-runs a failed import from its original payload.
 *
 * The CSV lives in the job's own data and is retained for 14 days after a
 * failure (`removeOnFail`), so a job that died partway through can be re-run
 * without the operator having to find and re-upload the file. Importers are
 * idempotent — vessels upsert on IMO — so replaying a partially-applied import
 * updates what landed the first time rather than duplicating it.
 */
export async function retryCsvImport(jobId: string, workspaceId: string) {
  const job = await getCsvImportJob(jobId);
  if (!job) return { ok: false as const, reason: "not-found" as const };
  if (job.data.workspaceId !== workspaceId) {
    return { ok: false as const, reason: "not-found" as const };
  }
  const state = await job.getState();
  if (state !== "failed") return { ok: false as const, reason: "not-failed" as const };

  const replacement = await enqueueCsvImport(job.data);
  return { ok: true as const, jobId: replacement?.id ?? null };
}

export type CsvImportJobView = {
  jobId: string;
  importType: CsvImportType;
  status: string;
  done: number | null;
  total: number | null;
  created: number | null;
  updated: number | null;
  errorCount: number | null;
  failedReason: string | null;
  createdAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** True when the job holds an active slot but no worker is running it. */
  stalled: boolean;
};

/** An active job whose lock lapsed this long ago is not being worked on. */
const STALLED_AFTER_MS = 5 * 60_000;

/**
 * Recent import jobs for one workspace, newest first.
 *
 * BullMQ has no secondary index on job payloads, so this reads the queue's
 * state lists and filters by `data.workspaceId` in memory. That is fine at this
 * queue's size (jobs are retained a week) and avoids maintaining a parallel
 * index that could drift from the queue itself.
 */
export async function listCsvImportJobs(
  workspaceId: string,
  limit = 25,
): Promise<CsvImportJobView[]> {
  const csvQueue = getCsvImportQueue();
  if (!csvQueue) return [];

  const jobs = await csvQueue.getJobs(
    ["active", "waiting", "delayed", "completed", "failed", "paused"],
    0,
    // Over-fetch, because the slice is across ALL workspaces and gets filtered
    // down to this one.
    limit * 8,
  );
  const now = Date.now();

  const views = await Promise.all(
    jobs
      .filter((job) => job?.data?.workspaceId === workspaceId)
      .map(async (job) => {
        const status = await job.getState();
        const progress = job.progress;
        const shaped =
          progress && typeof progress === "object"
            ? (progress as { done?: number; total?: number })
            : null;
        const result = job.returnvalue;

        return {
          jobId: String(job.id),
          importType: job.data.importType,
          status,
          done: shaped?.done ?? null,
          total: shaped?.total ?? null,
          created: result?.created ?? null,
          updated: result?.updated ?? null,
          errorCount: result?.errors?.length ?? null,
          failedReason: job.failedReason ?? null,
          createdAt: job.timestamp ?? null,
          startedAt: job.processedOn ?? null,
          finishedAt: job.finishedOn ?? null,
          // An "active" job whose progress hasn't moved in minutes is wedged,
          // not working — that is what a paused or restarted worker leaves
          // behind, and the UI must be able to say so rather than showing an
          // eternal spinner.
          stalled:
            status === "active" &&
            now - (job.processedOn ?? job.timestamp ?? now) > STALLED_AFTER_MS,
        } satisfies CsvImportJobView;
      }),
  );

  return views
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, limit);
}

/**
 * Returns wedged import jobs to the queue.
 *
 * When the worker process dies mid-job — or the Redis quota guard pauses it,
 * which also stops BullMQ's stalled checker — the job stays in `active`
 * forever. With `concurrency: 1` that one job blocks every later import behind
 * it, which is how a queue ends up "pending since yesterday". BullMQ recovers
 * these on its own only while a worker is actually running and unpaused, so it
 * cannot recover from the case where nothing is running.
 */
export async function requeueStalledCsvImports(): Promise<number> {
  const csvQueue = getCsvImportQueue();
  if (!csvQueue) return 0;

  const active = await csvQueue.getJobs(["active"], 0, 100);
  const now = Date.now();
  let requeued = 0;

  for (const job of active) {
    if (now - (job.processedOn ?? job.timestamp ?? now) <= STALLED_AFTER_MS) continue;
    try {
      // Remove-then-re-add rather than `job.retry()`: BullMQ's `reprocessJob`
      // only accepts jobs sitting in the `completed`/`failed` sets, and a job
      // orphaned in `active` is in neither.
      //
      // `remove()` refuses while a live worker still holds the job's lock and
      // succeeds only once that lock has expired, so this can never yank a job
      // out from under a worker that is genuinely still processing it. The new
      // job gets a new id; the payload — CSV included — carries over intact.
      const { data } = job;
      await job.remove();
      await enqueueCsvImport(data);
      requeued += 1;
    } catch (error) {
      // The common case here is "locked by another worker", i.e. the job is
      // actually being processed and our staleness guess was wrong. Not fatal.
      console.error(
        `[csv-import] could not requeue stalled job ${job.id}: ${(error as Error).message}`,
      );
    }
  }

  if (requeued > 0) {
    console.log(`[csv-import] requeued ${requeued} stalled import job(s) left active by a previous run.`);
  }
  return requeued;
}


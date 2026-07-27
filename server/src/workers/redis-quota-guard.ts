import type { Redis } from "ioredis";

/**
 * Minimal structural view of a BullMQ Worker — just the members the guard
 * touches. Typed this way (rather than `Worker`) so workers with different
 * job-name generics (e.g. the analytics cron's `CronJobName`) all fit the
 * same array without a variance clash.
 */
type GuardableWorker = {
  pause: (doNotWaitActive?: boolean) => Promise<void>;
  resume: () => void;
  on: (event: "error", listener: (err: Error) => void) => unknown;
};

/**
 * Upstash bills per Redis command and enforces a hard monthly request cap.
 * When it's hit, every BullMQ poll (`evalsha` against the queue keys) rejects
 * with `ERR max requests limit exceeded`. BullMQ's internal loop keeps
 * polling regardless, so the process floods the log with identical
 * ReplyError stacks — several per second, per worker — AND keeps burning the
 * (already-exhausted) quota on retries.
 *
 * This guard makes the failure graceful:
 *   1. Detects the quota-exhausted reply.
 *   2. Logs it ONCE per cooldown window instead of per command.
 *   3. Pauses every worker so the tight poll loop stops (no more doomed
 *      requests, no more spam). The HTTP server keeps running.
 *   4. Periodically probes with a single cheap command; when the quota
 *      resets (new billing month) or is upgraded, it resumes the workers.
 *
 * Nothing here restores lost quota — it just stops the app from making a bad
 * situation worse and keeps the logs readable.
 */

const QUOTA_ERROR_RE = /max requests limit exceeded|max daily request limit|quota/i;

export function isQuotaError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return QUOTA_ERROR_RE.test(msg);
}

type GuardState = {
  paused: boolean;
  lastLogAt: number;
  probeTimer: ReturnType<typeof setInterval> | null;
};

const LOG_COOLDOWN_MS = 60_000; // one quota log per minute, max
const PROBE_INTERVAL_MS = 5 * 60_000; // re-check for quota recovery every 5 min

/**
 * Attach quota-exhaustion handling to a set of workers sharing one Redis
 * connection. Call once, right after the workers are created.
 */
export function installRedisQuotaGuard(connection: Redis, workers: GuardableWorker[]) {
  const state: GuardState = { paused: false, lastLogAt: 0, probeTimer: null };

  const logOnce = (context: string) => {
    const now = Date.now();
    if (now - state.lastLogAt < LOG_COOLDOWN_MS) return;
    state.lastLogAt = now;
    console.warn(
      `[redis-quota] Upstash request quota exhausted (${context}). ` +
        `Background workers are PAUSED to stop the retry flood; the web server keeps running. ` +
        `They resume automatically once the quota resets (new billing month) or the plan is upgraded. ` +
        `See https://upstash.com/docs/redis/troubleshooting/max_requests_limit`,
    );
  };

  const pauseAll = async (context: string) => {
    if (state.paused) return;
    state.paused = true;
    logOnce(context);
    // `force: false` lets in-flight jobs finish; new polling stops.
    await Promise.all(
      workers.map((w) => w.pause(false).catch(() => undefined)),
    );
    startProbe();
  };

  const resumeAll = () => {
    if (!state.paused) return;
    state.paused = false;
    stopProbe();
    for (const w of workers) {
      try {
        w.resume();
      } catch {
        // ignore — a worker that's already closed can't resume, which is fine.
      }
    }
    console.log("[redis-quota] quota recovered — background workers resumed.");
  };

  const startProbe = () => {
    if (state.probeTimer) return;
    state.probeTimer = setInterval(async () => {
      try {
        // One cheap command. If the quota is still gone this rejects and we
        // stay paused; if it succeeds the quota is back.
        await connection.ping();
        resumeAll();
      } catch (err) {
        if (isQuotaError(err)) {
          // Still exhausted — the probe itself costs 1 request but only once
          // per PROBE_INTERVAL_MS, which is negligible.
          return;
        }
        // A non-quota error (network blip) — leave paused; next probe retries.
      }
    }, PROBE_INTERVAL_MS);
    if (typeof state.probeTimer === "object" && "unref" in state.probeTimer) {
      // Don't keep the process alive just for the probe timer.
      (state.probeTimer as unknown as { unref: () => void }).unref();
    }
  };

  const stopProbe = () => {
    if (state.probeTimer) {
      clearInterval(state.probeTimer);
      state.probeTimer = null;
    }
  };

  // Connection-level errors (ioredis surfaces quota replies here too on some
  // command paths). Swallow the spam; pause on quota.
  connection.on("error", (err) => {
    if (isQuotaError(err)) {
      void pauseAll("connection error");
      return;
    }
    // Non-quota connection errors: log once per cooldown so a flapping
    // connection doesn't spam either.
    const now = Date.now();
    if (now - state.lastLogAt >= LOG_COOLDOWN_MS) {
      state.lastLogAt = now;
      console.error(`[redis-quota] Redis connection error: ${(err as Error).message}`);
    }
  });

  // Per-worker error events — BullMQ emits `error` for internal poll-loop
  // failures (the evalsha rejections that were flooding the log).
  for (const w of workers) {
    w.on("error", (err) => {
      if (isQuotaError(err)) {
        void pauseAll("worker poll");
      }
      // Non-quota worker errors are already logged by the `failed` handlers
      // in worker.ts; don't double-log here.
    });
  }

  return {
    isPaused: () => state.paused,
    stop: () => stopProbe(),
  };
}

import { DelayedError, type Job, type WorkerOptions } from "bullmq";
import type { Redis } from "ioredis";

// Hard ceiling on how many times a single step job may be deferred for the
// per-inbox send gap. With a max gap of 20 min, 72 re-defers spans ~24h — well
// beyond any realistic same-day cooldown, while still guaranteeing a job can't
// loop forever if an inbox never frees up.
const MAX_DEFERS = 72;

/**
 * Re-delays the current step job because its chosen inbox is still inside its
 * per-inbox send-gap cooldown. Uses BullMQ's in-place `moveToDelayed` (not a
 * re-add) so the same job/jobId fires again after `retryAfterMs`, preserving
 * retry/backoff state. The caller MUST rethrow the returned DelayedError so
 * BullMQ hands the job off cleanly instead of marking it completed.
 *
 * Returns `null` once MAX_DEFERS is exceeded — the caller should then let the
 * job resolve normally (as a no-op) so a permanently-blocked inbox can't spin
 * forever.
 */
export async function deferJob(
  job: Job,
  token: string | undefined,
  retryAfterMs: number,
): Promise<DelayedError | null> {
  const deferCount = ((job.data?.__deferCount as number) ?? 0) + 1;
  if (deferCount > MAX_DEFERS || !token) {
    return null;
  }
  await job.updateData({ ...job.data, __deferCount: deferCount });
  await job.moveToDelayed(Date.now() + Math.max(1_000, Math.ceil(retryAfterMs)), token);
  return new DelayedError();
}

// Upstash charges per Redis command, and BullMQ's defaults were designed for
// self-hosted Redis where blocking commands are effectively free. Every idle
// Worker was issuing a fresh BRPOPLPUSH every 5s (drainDelay) plus a stalled
// scan every 30s — that's ~20k commands/day per worker even with zero jobs.
// Five workers × 30 days = ~3M requests/month, well past the free tier.
//
// Delayed jobs still fire promptly because BullMQ's scheduler wakes the
// blocking wait as soon as a job becomes ready — drainDelay only controls
// the max idle timeout. So we lengthen it aggressively and only shorten
// stalled detection enough to still catch a stuck job in reasonable time.
export function workerOptionsFor(connection: Redis, overrides: Partial<WorkerOptions> = {}): WorkerOptions {
  return {
    connection,
    drainDelay: 300,
    stalledInterval: 300_000,
    ...overrides,
  };
}

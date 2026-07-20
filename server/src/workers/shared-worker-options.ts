import type { WorkerOptions } from "bullmq";
import type { Redis } from "ioredis";

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

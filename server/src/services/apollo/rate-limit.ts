import { getRedisClient } from "../token-store.js";

/**
 * Apollo's people/match budget, tracked across everything that spends it.
 *
 * The plan allows 200 match calls an hour. A manual reveal is one call and
 * never notices; the drip fires them back to back and exhausted the whole hour
 * in a few minutes, after which every reveal 429'd — including the user's own
 * manual ones, since it is one shared quota.
 *
 * Counting our own calls is what makes that avoidable rather than discoverable.
 * A sorted set keyed by timestamp gives a true rolling hour: a fixed bucket
 * would let 199 calls at 10:59 and another 199 at 11:01 through.
 *
 * Scoped per Apollo account, because a workspace on its own key has its own
 * separate allowance.
 */

/** Held under 200 so a manual reveal can still get through after a drip run. */
export const MATCH_HOURLY_BUDGET = 170;

const WINDOW_MS = 60 * 60 * 1000;
const key = (scope: string) => `apollo:match:${scope}`;

/** Calls made in the last hour. Trims the window as a side effect. */
export async function matchCallsInLastHour(scope: string): Promise<number> {
  const redis = await getRedisClient();
  // No Redis means no accounting — don't block real work over telemetry.
  if (!redis) return 0;
  const k = key(scope);
  await redis.zremrangebyscore(k, 0, Date.now() - WINDOW_MS);
  return redis.zcard(k);
}

export async function matchBudgetRemaining(scope: string): Promise<number> {
  return Math.max(0, MATCH_HOURLY_BUDGET - (await matchCallsInLastHour(scope)));
}

/** Record one match call against the rolling window. */
export async function recordMatchCall(scope: string): Promise<void> {
  const redis = await getRedisClient();
  if (!redis) return;
  const k = key(scope);
  const now = Date.now();
  await redis.zadd(k, now, `${now}-${Math.random().toString(36).slice(2, 8)}`);
  // Slightly longer than the window so the key self-expires when idle.
  await redis.expire(k, 3900);
}

/**
 * When the oldest call in the window ages out, freeing one slot. Lets the UI
 * say "try again in 12 minutes" instead of "rate limited".
 */
export async function matchBudgetResetsInMs(scope: string): Promise<number> {
  const redis = await getRedisClient();
  if (!redis) return 0;
  const oldest = await redis.zrange(key(scope), 0, 0, "WITHSCORES");
  if (oldest.length < 2) return 0;
  const at = Number(oldest[1]);
  return Math.max(0, at + WINDOW_MS - Date.now());
}

import { getToken, incrementToken } from "../token-store.js";

const COUNTER_TTL = 7 * 24 * 60 * 60;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateBefore(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function queryKey(date: string) {
  return `maribiz:usage:queries:${date}`;
}

function cacheHitKey(date: string) {
  return `maribiz:usage:cache-hits:${date}`;
}

export async function recordQuery() {
  await incrementToken(queryKey(today()), COUNTER_TTL).catch(() => undefined);
}

export async function recordCacheHit() {
  await incrementToken(cacheHitKey(today()), COUNTER_TTL).catch(() => undefined);
}

async function readCounter(key: string): Promise<number> {
  const value = await getToken(key).catch(() => null);
  return Number(value ?? 0);
}

export async function getUsageWindow() {
  const todayKey = today();
  const [todayQueries, todayHits] = await Promise.all([
    readCounter(queryKey(todayKey)),
    readCounter(cacheHitKey(todayKey)),
  ]);

  const last7Days = await Promise.all(
    Array.from({ length: 7 }, (_, i) => dateBefore(i)).map(async (date) => {
      const [queries, hits] = await Promise.all([
        readCounter(queryKey(date)),
        readCounter(cacheHitKey(date)),
      ]);
      return { queries, hits };
    }),
  );

  const last7d = last7Days.reduce(
    (acc, day) => ({ queries: acc.queries + day.queries, hits: acc.hits + day.hits }),
    { queries: 0, hits: 0 },
  );

  return {
    today: { queries: todayQueries, cacheHits: todayHits },
    last7d: { queries: last7d.queries, cacheHits: last7d.hits },
  };
}

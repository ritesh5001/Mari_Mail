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
  return `apollo:usage:queries:${date}`;
}

function emailRevealKey(date: string) {
  return `apollo:usage:email-reveals:${date}`;
}

function phoneRevealKey(date: string) {
  return `apollo:usage:phone-reveals:${date}`;
}

function cacheHitKey(date: string) {
  return `apollo:usage:cache-hits:${date}`;
}

export async function recordQuery() {
  await incrementToken(queryKey(today()), COUNTER_TTL).catch(() => undefined);
}

export async function recordEmailReveal() {
  await incrementToken(emailRevealKey(today()), COUNTER_TTL).catch(() => undefined);
}

export async function recordPhoneReveal() {
  await incrementToken(phoneRevealKey(today()), COUNTER_TTL).catch(() => undefined);
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
  const [todayQueries, todayEmails, todayPhones, todayHits] = await Promise.all([
    readCounter(queryKey(todayKey)),
    readCounter(emailRevealKey(todayKey)),
    readCounter(phoneRevealKey(todayKey)),
    readCounter(cacheHitKey(todayKey)),
  ]);

  const last7Days = await Promise.all(
    Array.from({ length: 7 }, (_, i) => dateBefore(i)).map(async (date) => {
      const [queries, emails, phones, hits] = await Promise.all([
        readCounter(queryKey(date)),
        readCounter(emailRevealKey(date)),
        readCounter(phoneRevealKey(date)),
        readCounter(cacheHitKey(date)),
      ]);
      return { queries, emails, phones, hits };
    }),
  );

  const last7d = last7Days.reduce(
    (acc, day) => ({
      queries: acc.queries + day.queries,
      emailReveals: acc.emailReveals + day.emails,
      phoneReveals: acc.phoneReveals + day.phones,
      cacheHits: acc.cacheHits + day.hits,
    }),
    { queries: 0, emailReveals: 0, phoneReveals: 0, cacheHits: 0 },
  );

  return {
    today: {
      queries: todayQueries,
      emailReveals: todayEmails,
      phoneReveals: todayPhones,
      cacheHits: todayHits,
    },
    last7d,
  };
}

import { Redis } from "ioredis";

type StoreValue = string;

const memoryStore = new Map<string, { value: StoreValue; expiresAt: number }>();

function shouldUseRedis() {
  const url = process.env.REDIS_URL;
  return Boolean(url) && !/localhost|127\.0\.0\.1|::1/.test(url ?? "");
}

const redis = shouldUseRedis()
  ? new Redis(process.env.REDIS_URL as string, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false })
  : null;

if (redis) {
  redis.on("error", (err) => {
    console.warn(`[token-store] Redis error: ${(err as Error).message}`);
  });
}

let redisDisabled = false;

async function getRedis() {
  if (!redis || redisDisabled) return null;
  try {
    if (redis.status === "wait" || redis.status === "end") {
      await redis.connect();
    }
    return redis;
  } catch (err) {
    console.warn(`[token-store] disabling Redis after connect failure: ${(err as Error).message}`);
    redisDisabled = true;
    return null;
  }
}

export async function checkRedisHealth() {
  const client = await getRedis();
  if (!client) return false;
  try {
    return (await client.ping()) === "PONG";
  } catch {
    return false;
  }
}

export async function setToken(key: string, value: StoreValue, ttlSeconds: number) {
  const client = await getRedis();
  if (client) {
    try {
      await client.set(key, value, "EX", ttlSeconds);
      return;
    } catch (err) {
      console.warn(`[token-store] redis set failed, using memory: ${(err as Error).message}`);
    }
  }
  memoryStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

export async function getToken(key: string) {
  const client = await getRedis();
  if (client) {
    try {
      return await client.get(key);
    } catch (err) {
      console.warn(`[token-store] redis get failed, using memory: ${(err as Error).message}`);
    }
  }
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

export async function incrementToken(key: string, ttlSeconds: number) {
  const client = await getRedis();
  if (client) {
    try {
      const value = await client.incr(key);
      await client.expire(key, ttlSeconds);
      return value;
    } catch (err) {
      console.warn(`[token-store] redis incr failed, using memory: ${(err as Error).message}`);
    }
  }
  const current = await getToken(key);
  const value = Number(current ?? 0) + 1;
  memoryStore.set(key, { value: String(value), expiresAt: Date.now() + ttlSeconds * 1000 });
  return value;
}

export async function deleteToken(key: string) {
  const client = await getRedis();
  if (client) {
    try {
      await client.del(key);
      return;
    } catch (err) {
      console.warn(`[token-store] redis del failed, using memory: ${(err as Error).message}`);
    }
  }
  memoryStore.delete(key);
}

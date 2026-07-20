import { getToken, setToken, deleteToken } from "./token-store.js";

export async function cacheJson<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  const cached = await getToken(key);
  if (cached) {
    try {
      return JSON.parse(cached) as T;
    } catch {
      // fall through and refresh
    }
  }
  const value = await loader();
  await setToken(key, JSON.stringify(value), ttlSeconds);
  return value;
}

export async function invalidateCache(key: string) {
  await deleteToken(key);
}

export function workspaceCacheKey(workspaceId: string, key: string) {
  return `ws:${workspaceId}:${key}`;
}

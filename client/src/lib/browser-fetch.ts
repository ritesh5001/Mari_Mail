import { apiUrl } from "@/lib/client-api";

let refreshInFlight: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${apiUrl}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

function redirectToLogin() {
  if (typeof window === "undefined") return;
  const next = `${window.location.pathname}${window.location.search}`;
  const target = `/login?next=${encodeURIComponent(next)}`;
  if (window.location.pathname !== "/login") {
    window.location.href = target;
  }
}

const inflightGets = new Map<string, Promise<Response>>();

function isGet(init: RequestInit) {
  const m = (init.method ?? "GET").toUpperCase();
  return m === "GET" || m === "HEAD";
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const url = path.startsWith("http") || path.startsWith("/backend") ? path : `${apiUrl}${path}`;
  const merged: RequestInit = { ...init, credentials: "include" };

  if (isGet(merged) && typeof window !== "undefined") {
    const existing = inflightGets.get(url);
    if (existing) return existing.then((r) => r.clone());
    const p = (async () => {
      const response = await fetch(url, merged);
      if (response.status !== 401) return response;
      const refreshed = await attemptRefresh();
      if (!refreshed) {
        redirectToLogin();
        return response;
      }
      return fetch(url, merged);
    })();
    inflightGets.set(url, p);
    p.finally(() => inflightGets.delete(url));
    return p.then((r) => r.clone());
  }

  const response = await fetch(url, merged);
  if (response.status !== 401) return response;

  const refreshed = await attemptRefresh();
  if (!refreshed) {
    redirectToLogin();
    return response;
  }

  return fetch(url, merged);
}

export async function apiFetchJson<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const res = await apiFetch(path, init);
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

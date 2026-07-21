import { cache } from "react";
import { cookies } from "next/headers";
import type { AuthSession } from "@marimail/types";

export const apiUrl =
  process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type ApiResponse<T> = {
  data: T;
};

export async function apiFetch<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return (await response.json()) as ApiResponse<T>;
}

// Wrapped in React `cache()` so the session is fetched at most ONCE per server
// render, no matter how many callers ask for it. Every dashboard page render
// previously triggered 3–5 separate `/auth/session` round-trips to the backend
// (the dashboard layout + nested layouts + the page + each data-lib `require*`
// helper), each a cross-region HTTP call before any data loaded. `cache()` is
// per-request scoped, so cookies are still read fresh on every request — this
// only dedupes within a single render, with no staleness.
export const getServerSession = cache(
  async (): Promise<AuthSession | null> => {
    const cookieHeader = cookies().toString();
    try {
      const response = await fetch(`${apiUrl}/auth/session`, {
        headers: { Cookie: cookieHeader },
        cache: "no-store",
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as ApiResponse<AuthSession>;
      return payload.data;
    } catch (error) {
      console.error("[getServerSession] fetch failed", error);
      return null;
    }
  },
);

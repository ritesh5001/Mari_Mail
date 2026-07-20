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

export async function getServerSession() {
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
}

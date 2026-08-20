"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Monitor, Smartphone } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

type SessionRow = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expires: string;
  current: boolean;
};

/**
 * Turns a raw user-agent into something a person can recognise.
 *
 * Deliberately coarse — the goal is "is this me?", which needs the browser and
 * the platform and nothing else. Parsing UA strings precisely is a losing game
 * and the extra detail wouldn't change the answer.
 */
function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : /Firefox\//.test(ua) ? "Firefox"
    : "Browser";
  const platform =
    /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Windows/.test(ua) ? "Windows"
    : /Linux/.test(ua) ? "Linux"
    : "";
  return platform ? `${browser} on ${platform}` : browser;
}

function isMobile(ua: string | null) {
  return Boolean(ua && /iPhone|iPad|iPod|Android|Mobile/.test(ua));
}

export function SessionsPanel() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/auth/sessions");
      const payload = (await res.json()) as {
        data?: SessionRow[];
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(payload.error?.message ?? "Could not load your sessions");
      setSessions(payload.data ?? []);
    } catch (err) {
      setError((err as Error).message);
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revoke(id: string) {
    setRevoking(id);
    setError(null);
    try {
      const res = await apiFetch(`/auth/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = (await res.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "Could not sign that device out");
      }
      setSessions((prev) => prev?.filter((row) => row.id !== id) ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRevoking(null);
    }
  }

  if (sessions === null) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div>
      {error ? <p className="mb-3 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
      {sessions.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-white/45">No active sessions found.</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          {sessions.map((row) => {
            const Icon = isMobile(row.userAgent) ? Smartphone : Monitor;
            return (
              <li key={row.id} className="flex items-center gap-3 py-3">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/50">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                    <span className="truncate">{describeAgent(row.userAgent)}</span>
                    {row.current ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300">
                        This device
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-white/45">
                    {row.ipAddress ?? "Unknown IP"} · last used{" "}
                    {new Date(row.lastUsedAt ?? row.createdAt).toLocaleString()}
                  </p>
                </div>
                {/* Revoking the current session would sign you out mid-page
                    with no explanation; use Log out for that. */}
                {row.current ? null : (
                  <button
                    type="button"
                    onClick={() => revoke(row.id)}
                    disabled={revoking === row.id}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-red-300 hover:text-red-600 disabled:opacity-40 dark:border-white/10 dark:text-white/70 dark:hover:border-red-400/40 dark:hover:text-red-400"
                  >
                    {revoking === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Sign out
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

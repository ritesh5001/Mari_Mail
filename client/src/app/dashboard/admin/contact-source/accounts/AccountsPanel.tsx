"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Star, TriangleAlert, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

export type ApolloAccountDTO = {
  id: string;
  label: string;
  apiBaseUrl: string;
  isDefault: boolean;
  status: "UNTESTED" | "ACTIVE" | "ERROR";
  lastTestAt: string | null;
  lastTestError: string | null;
  lastTestInfo: string | null;
  createdAt: string;
  createdBy: string | null;
};

export function AccountsPanel({ initial }: { initial: ApolloAccountDTO[] }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function testKey() {
    setBusy("test");
    setError(null);
    setTestResult(null);
    try {
      const res = await apiFetch(`/api/admin/apollo-accounts/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      const payload = (await res.json()) as {
        data?: { ok: boolean; message: string };
        error?: { message?: string };
      };
      if (!res.ok) setError(payload.error?.message ?? "Test failed");
      else setTestResult(payload.data ?? null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    setBusy("connect");
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/apollo-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || "Provider account", apiKey: apiKey.trim() }),
      });
      const payload = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(payload.error?.message ?? "Could not connect the account");
        return;
      }
      setLabel("");
      setApiKey("");
      setTestResult(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, action: "test" | "default" | "delete") {
    if (action === "delete" && !confirm("Remove this provider account? Lookups fall back to the next key, or to the platform key if none is left.")) return;
    setBusy(id);
    setError(null);
    try {
      if (action === "delete") await apiFetch(`/api/admin/apollo-accounts/${id}`, { method: "DELETE" });
      else if (action === "test") await apiFetch(`/api/admin/apollo-accounts/${id}/test`, { method: "POST" });
      else
        await apiFetch(`/api/admin/apollo-accounts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isDefault: true }),
        });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.02]">
        <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Connect a provider account</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
          Uses your own provider plan for this workspace&rsquo;s searches and reveals. Because you pay
          the provider directly, reveals made through your key don&rsquo;t spend platform credits.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-[11px] font-medium text-slate-600 dark:text-white/60">
            Name
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. NextGen Fusion account"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
            />
          </label>
          <label className="block text-[11px] font-medium text-slate-600 dark:text-white/60">
            API key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestResult(null);
              }}
              placeholder="Provider API key"
              autoComplete="off"
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-ocean dark:border-white/10 dark:bg-white/[0.06] dark:text-white"
            />
          </label>
        </div>

        {testResult ? (
          <p
            className={`mt-3 rounded-md border px-3 py-2 text-[11px] ${
              testResult.ok
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200"
                : "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200"
            }`}
          >
            {testResult.message}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-[11px] text-rose-600 dark:text-rose-300">{error}</p>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={testKey}
            disabled={apiKey.trim().length < 10 || busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/10"
          >
            {busy === "test" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Test key
          </button>
          <button
            type="button"
            onClick={connect}
            disabled={apiKey.trim().length < 10 || busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md bg-ocean px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
          >
            {busy === "connect" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Connect
          </button>
          <span className="text-[11px] text-slate-400 dark:text-white/40">
            The key is verified on connect and stored encrypted — it is never shown again.
          </span>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Connected accounts</h2>
        {initial.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-xs text-slate-500 dark:border-white/15 dark:text-white/50">
            None connected. This workspace uses the platform key, and reveals cost platform
            credits.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {initial.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                    {a.label}
                    {a.isDefault ? (
                      <span className="inline-flex items-center gap-1 rounded bg-ocean/10 px-1.5 py-0.5 text-[10px] font-semibold text-ocean">
                        <Star className="h-3 w-3" /> in use
                      </span>
                    ) : null}
                    {a.status === "ACTIVE" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    ) : a.status === "ERROR" ? (
                      <TriangleAlert className="h-3.5 w-3.5 text-rose-600" />
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-white/50">
                    {a.lastTestAt
                      ? `Last checked ${new Date(a.lastTestAt).toLocaleString()}`
                      : "Never checked"}
                    {a.createdBy ? ` · added by ${a.createdBy}` : ""}
                  </p>
                  {a.lastTestError ? (
                    <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-300">{a.lastTestError}</p>
                  ) : a.lastTestInfo ? (
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-white/40">{a.lastTestInfo}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {busy === a.id ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => act(a.id, "test")}
                        className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/10"
                      >
                        Test
                      </button>
                      {!a.isDefault ? (
                        <button
                          type="button"
                          onClick={() => act(a.id, "default")}
                          className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/10"
                        >
                          Use this
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => act(a.id, "delete")}
                        className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-400/10"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

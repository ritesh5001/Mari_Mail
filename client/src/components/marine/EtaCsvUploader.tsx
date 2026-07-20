"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Download, Loader2, Upload } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import { apiUrl } from "@/lib/client-api";

type BulkUpdateResult = {
  processed: number;
  updated: number;
  created: number;
  skippedNotFound: number;
  errors: Array<{ row: number; imo?: string; message: string }>;
};

export function EtaCsvUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkUpdateResult | null>(null);

  async function handleSubmit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const csv = await file.text();
      const res = await apiFetch("/api/vessel-etas/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const text = await res.text();
      let payload: { data?: BulkUpdateResult; error?: { message?: string } } | null = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = null;
      }
      if (!res.ok || !payload) {
        const fallback =
          res.status === 404
            ? "Server endpoint not found. The ETA bulk-update API may not be deployed yet."
            : res.status === 413
              ? "CSV is too large for the server to accept in a single request."
              : `Server returned ${res.status} ${res.statusText || ""}`.trim();
        setError(payload?.error?.message ?? fallback);
        return;
      }
      setResult(payload.data as BulkUpdateResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read file");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Upload CSV</h2>
        <a
          href={`${apiUrl}/api/vessel-etas/csv/template`}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/[0.06]"
        >
          <Download className="h-4 w-4" />
          Download template
        </a>
      </div>

      <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center hover:border-slate-400 dark:border-white/15 dark:bg-white/[0.02] dark:hover:border-white/30">
        <Upload className="h-6 w-6 text-slate-400 dark:text-white/40" />
        <span className="text-sm font-medium text-slate-700 dark:text-white/80">
          {file ? file.name : "Choose CSV file"}
        </span>
        <span className="text-xs text-slate-500 dark:text-white/45">
          Columns: IMO, ETA, Destination Port or port name (optional)
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
            setError(null);
          }}
        />
      </label>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setFile(null);
            setResult(null);
            setError(null);
          }}
          disabled={busy || (!file && !result && !error)}
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/[0.06]"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!file || busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-ocean px-4 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-ocean/90 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Updating…" : "Update ETAs"}
        </button>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm dark:border-red-800/40 dark:bg-red-900/15">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <span className="text-red-700 dark:text-red-300">{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-800/40 dark:bg-emerald-900/15">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
            <div className="text-emerald-700 dark:text-emerald-300">
              Processed {result.processed} row{result.processed === 1 ? "" : "s"} —{" "}
              <strong>{result.updated} updated</strong>
              {result.created > 0 ? `, ${result.created} created` : ""}
              {result.skippedNotFound > 0
                ? `, ${result.skippedNotFound} skipped (unknown IMO)`
                : ""}
              {result.errors.length > 0 ? `, ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}` : ""}
              .
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/40 dark:bg-amber-900/15">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Rows with errors
              </p>
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-amber-700 dark:text-amber-200/80">
                {result.errors.map((err, idx) => (
                  <li key={`${err.row}-${idx}`}>
                    Row {err.row}
                    {err.imo ? ` (IMO ${err.imo})` : ""}: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

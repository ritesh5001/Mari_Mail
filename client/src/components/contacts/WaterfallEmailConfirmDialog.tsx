"use client";

import { AlertTriangle, Coins, Loader2, Search, X } from "lucide-react";

export type WaterfallEmailCandidate = {
  externalId: string;
  firstName: string;
  lastName: string;
  companyName: string;
};

export function WaterfallEmailConfirmDialog({
  candidates,
  creditPerSearch,
  creditBalance,
  busy,
  progress,
  onCancel,
  onConfirm,
}: {
  candidates: WaterfallEmailCandidate[];
  creditPerSearch: number;
  creditBalance: number | null;
  busy: boolean;
  progress?: { done: number; total: number } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (candidates.length === 0) return null;

  const total = candidates.length * creditPerSearch;
  const insufficient = creditBalance !== null && creditBalance < total;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="waterfall-confirm-title"
        aria-describedby="waterfall-confirm-description"
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#101013]"
      >
        <div className="flex items-start gap-4 border-b border-slate-200 p-5 dark:border-white/10">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300">
            <Search className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="waterfall-confirm-title" className="text-base font-semibold text-slate-950 dark:text-white">
              Run waterfall email search?
            </h2>
            <p id="waterfall-confirm-description" className="mt-1 text-sm leading-5 text-slate-600 dark:text-white/55">
              The normal provider has no email for {candidates.length === 1 ? "this contact" : "these contacts"}.
              MariMail will check the verified fallback sources only after you approve the charge.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Cancel waterfall search"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40 dark:hover:bg-white/[0.06] dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Contacts</p>
              <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{candidates.length}</p>
            </div>
            <div className="border-x border-slate-200 px-3 py-3 dark:border-white/10">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Each</p>
              <p className="mt-1 text-base font-semibold text-slate-900 dark:text-white">{creditPerSearch}</p>
            </div>
            <div className="px-3 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Total cost</p>
              <p className="mt-1 inline-flex items-center gap-1 text-base font-semibold text-violet-700 dark:text-violet-300">
                <Coins className="h-4 w-4" />
                {total}
              </p>
            </div>
          </div>

          <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-white/10">
            {candidates.slice(0, 8).map((candidate) => {
              const name = `${candidate.firstName} ${candidate.lastName}`.trim() || "Unknown contact";
              return (
                <div
                  key={candidate.externalId}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0 dark:border-white/[0.06]"
                >
                  <span className="truncate font-medium text-slate-800 dark:text-white/80">{name}</span>
                  <span className="max-w-[45%] truncate text-slate-400 dark:text-white/40">
                    {candidate.companyName || "Unknown company"}
                  </span>
                </div>
              );
            })}
            {candidates.length > 8 ? (
              <p className="px-3 py-2 text-xs text-slate-400">+{candidates.length - 8} more contacts</p>
            ) : null}
          </div>

          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-900 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              A completed search costs {creditPerSearch} credits per contact even if no email is found.
              If the fallback provider has a technical failure, those credits are refunded automatically.
            </p>
          </div>

          {insufficient ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
              Not enough credits. You need {total.toLocaleString()} but have {creditBalance?.toLocaleString()}.
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/[0.05]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy || insufficient}
              className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {busy && progress
                ? `Searching ${progress.done} of ${progress.total}…`
                : `Confirm & spend ${total.toLocaleString()} credits`}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

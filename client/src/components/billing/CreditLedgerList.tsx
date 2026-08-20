import { cn } from "@/lib/cn";
import { creditReasonLabel } from "@/lib/credit-reasons";

type LedgerRow = {
  id: string;
  delta: number;
  balance: number;
  reason: string;
  detail: string | null;
  createdAt: Date;
};

export function CreditLedgerList({ entries }: { entries: LedgerRow[] }) {
  if (entries.length === 0) {
    return (
      <p className="mt-3 text-sm text-slate-500 dark:text-white/45">
        No credit activity yet. Revealing a contact is usually the first entry here.
      </p>
    );
  }

  return (
    <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.06]">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              {creditReasonLabel(entry.reason)}
            </p>
            {/* `detail` names the actual contact or vessel. It used to be the
                headline with the reason as fallback, which meant a row could
                say "Revealed sarah@…" or "reveal email" depending on what the
                writer happened to pass. Reason leads; detail qualifies. */}
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-white/45">
              {entry.detail ? `${entry.detail} · ` : ""}
              {new Date(entry.createdAt).toLocaleString()}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className={cn(
                "text-sm font-semibold tabular-nums",
                entry.delta >= 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-slate-600 dark:text-white/55",
              )}
            >
              {entry.delta > 0 ? "+" : ""}
              {entry.delta.toLocaleString("en-US")}
            </p>
            <p className="text-xs tabular-nums text-slate-400 dark:text-white/35">
              {entry.balance.toLocaleString("en-US")} left
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

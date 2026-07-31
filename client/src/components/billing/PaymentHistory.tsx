import { formatUsdCents, PLANS, type PlanKey } from "@marimail/utils/plans";
import { cn } from "@/lib/cn";

type PaymentRow = {
  id: string;
  provider: string;
  status: string;
  purpose: string;
  amountCents: number;
  currency: string;
  grantPlan: string | null;
  grantCredits: number | null;
  failureReason: string | null;
  paidAt: Date | null;
  createdAt: Date;
};

type LedgerRow = {
  id: string;
  delta: number;
  balance: number;
  reason: string;
  detail: string | null;
  createdAt: Date;
};

/**
 * Payments and the credit ledger.
 *
 * Failed and abandoned attempts are shown, not just successes. A customer whose
 * card was declined needs to see that it was declined and why — silently
 * omitting the row leaves them staring at an unchanged plan with no explanation,
 * and reaching for support.
 */
export function PaymentHistory({
  payments,
  ledger,
}: {
  payments: PaymentRow[];
  ledger: LedgerRow[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Payments</h2>
        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-white/45">
            No payments yet. Your trial doesn&rsquo;t require a card.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.06]">
            {payments.map((payment) => (
              <li key={payment.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {describePayment(payment)}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-white/45">
                    {new Date(payment.paidAt ?? payment.createdAt).toLocaleString()} ·{" "}
                    {payment.provider.toLowerCase()}
                  </p>
                  {payment.failureReason ? (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {payment.failureReason}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                    {formatUsdCents(payment.amountCents)}
                  </p>
                  <StatusPill status={payment.status} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Credit activity</h2>
        {ledger.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500 dark:text-white/45">No credit activity yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.06]">
            {ledger.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-700 dark:text-white/70">
                    {entry.detail ?? entry.reason.toLowerCase().replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-white/35">
                    {new Date(entry.createdAt).toLocaleDateString()}
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
        )}
      </section>
    </div>
  );
}

function describePayment(payment: PaymentRow) {
  if (payment.grantPlan) {
    const label = PLANS[payment.grantPlan as PlanKey]?.label ?? payment.grantPlan;
    return `${label} plan — 30 days`;
  }
  if (payment.grantCredits) {
    return `${payment.grantCredits.toLocaleString("en-US")} contact credits`;
  }
  return payment.purpose.toLowerCase().replace(/_/g, " ");
}

function StatusPill({ status }: { status: string }) {
  // Each state carries its own word, so status never depends on colour alone.
  const className =
    status === "PAID"
      ? "text-emerald-600 dark:text-emerald-400"
      : status === "FAILED"
        ? "text-red-600 dark:text-red-400"
        : status === "REFUNDED"
          ? "text-sky-600 dark:text-sky-400"
          : "text-slate-400 dark:text-white/35";
  const label =
    status === "CREATED" ? "Not completed" : status.charAt(0) + status.slice(1).toLowerCase();
  return <p className={cn("text-xs font-medium", className)}>{label}</p>;
}

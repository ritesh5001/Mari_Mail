import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { CreditLedgerList } from "@/components/billing/CreditLedgerList";
import { getCreditHistory, requireBillingWorkspace } from "@/lib/billing-data";

export const dynamic = "force-dynamic";

/**
 * Credits, in one place.
 *
 * Before this page the balance appeared in four separate surfaces and the
 * history nowhere — a customer could see that 4,000 credits were gone but had
 * no way to find out what spent them. The three things they need are the
 * balance, what each action costs, and where it went, so all three are here
 * and nothing else is.
 */
export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { workspaceId } = await requireBillingWorkspace();
  const rawPage = typeof searchParams.page === "string" ? Number(searchParams.page) : 1;
  const { entries, total, balance, page, pageCount, pricing } = await getCreditHistory(
    workspaceId,
    rawPage,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.6fr)]">
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
          <p className="text-sm font-medium text-slate-500 dark:text-white/50">Credit balance</p>
          <p className="mt-2 text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {balance.toLocaleString("en-US")}
          </p>
          {/* The two rules people get wrong most often, stated once, here. */}
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-500 dark:text-white/45">
            Credits never expire and carry over when you renew. They can only be spent while your
            subscription is active.
          </p>
          <Link
            href="/dashboard/billing#credit-packs"
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-accent-600 dark:text-accent-300"
          >
            Buy more credits
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">What things cost</h2>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/[0.06]">
            {pricing.map((item) => (
              <li key={item.label} className="flex items-baseline justify-between gap-3 py-2">
                <span className="text-sm text-slate-600 dark:text-white/60">{item.label}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                  {item.credits.toLocaleString("en-US")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Credit history</h2>
          {total > 0 ? (
            <p className="text-xs text-slate-500 dark:text-white/45">
              {total.toLocaleString("en-US")} entr{total === 1 ? "y" : "ies"}
            </p>
          ) : null}
        </div>

        <CreditLedgerList entries={entries} />

        {pageCount > 1 ? (
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/[0.06]">
            <PageLink page={page - 1} disabled={page <= 1} direction="prev" />
            <p className="text-xs text-slate-500 dark:text-white/45">
              Page {page} of {pageCount}
            </p>
            <PageLink page={page + 1} disabled={page >= pageCount} direction="next" />
          </div>
        ) : null}
      </section>
    </div>
  );
}

/**
 * Rendered as a span when there is nowhere to go — an anchor that navigates to
 * the page you are already on looks enabled and does nothing.
 */
function PageLink({
  page,
  disabled,
  direction,
}: {
  page: number;
  disabled: boolean;
  direction: "prev" | "next";
}) {
  const label = direction === "prev" ? "Newer" : "Older";
  const icon =
    direction === "prev" ? <ArrowLeft className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />;
  const content = (
    <>
      {direction === "prev" ? icon : null}
      {label}
      {direction === "next" ? icon : null}
    </>
  );

  if (disabled) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-slate-300 dark:text-white/20">
        {content}
      </span>
    );
  }
  return (
    <Link
      href={`/dashboard/billing/credits?page=${page}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-accent-400 hover:text-accent-600 dark:border-white/10 dark:text-white/70 dark:hover:border-accent-400/50 dark:hover:text-accent-300"
    >
      {content}
    </Link>
  );
}

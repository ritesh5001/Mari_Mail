import Link from "next/link";
import { CreditCard, Check } from "lucide-react";
import { BillingActions } from "@/components/billing/BillingActions";
import { CREDIT_PACKS, PLAN_CATALOG, getBillingOverview, requireBillingWorkspace } from "@/lib/billing-data";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const { workspaceId } = await requireBillingWorkspace();
  const { workspace, usage, ledger } = await getBillingOverview(workspaceId);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell">
        <div className="flex items-center gap-3">
          <CreditCard className="h-6 w-6 text-ocean" />
          <div>
            <h2 className="text-2xl font-semibold text-slate-950">Billing & Credits</h2>
            <p className="text-sm text-slate-600">Manage your plan, monitor usage, and top up MariMail DB credits.</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <Stat label="Plan" value={workspace.plan} />
          <Stat label="Status" value={workspace.billingStatus} />
          <Stat label="Credits" value={workspace.creditBalance.toLocaleString("en")} />
          <Stat label="Renews" value={workspace.currentPeriodEnd ? new Date(workspace.currentPeriodEnd).toLocaleDateString() : "—"} />
        </dl>
        <p className="mt-3 text-xs text-slate-500">Usage this month: {usage.vessels.toLocaleString("en")} vessels (of {workspace.vesselLimit.toLocaleString("en")}) · {usage.emails.toLocaleString("en")} emails (of {workspace.emailLimit.toLocaleString("en")}).</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <BillingActions stripeCustomerConnected={Boolean(workspace.stripeCustomerId)} />
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PLAN_CATALOG.map((plan) => {
          const isCurrent = workspace.plan === plan.plan;
          return (
            <article key={plan.plan} className={`flex flex-col rounded-lg border bg-white p-5 shadow-sm ${isCurrent ? "border-ocean ring-1 ring-ocean" : "border-slate-200"}`}>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ocean">{plan.label}</p>
                <p className="mt-2 text-3xl font-semibold text-navy">{plan.priceUsd ? `$${plan.priceUsd}` : "Custom"}<span className="text-sm font-normal text-slate-500">{plan.priceUsd ? "/mo" : ""}</span></p>
              </div>
              <ul className="mt-3 flex-1 space-y-1 text-sm text-slate-600">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-emerald-500" />{feature}</li>
                ))}
              </ul>
              <BillingActions inlinePlan={plan.plan} disabled={isCurrent} stripeCustomerConnected={Boolean(workspace.stripeCustomerId)} />
            </article>
          );
        })}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Credit add-on packs</h3>
        <p className="text-xs text-slate-500">Credits replenish monthly with your plan. Buy add-on packs anytime — they don't expire.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {CREDIT_PACKS.map((pack) => (
            <article key={pack.packKey} className="flex flex-col rounded-md border border-slate-200 p-4">
              <p className="text-sm text-slate-500">{pack.credits.toLocaleString("en")} credits</p>
              <p className="mt-1 text-2xl font-semibold text-navy">${pack.priceUsd}</p>
              <BillingActions inlineCreditPack={pack.packKey} stripeCustomerConnected={Boolean(workspace.stripeCustomerId)} />
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Credit ledger</h3>
        <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2 text-right">Δ</th>
                <th className="px-3 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">No ledger entries yet.</td></tr>
              ) : ledger.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-600">{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-600">{entry.reason.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2 text-slate-500 truncate max-w-xs">{entry.detail ?? "—"}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${entry.delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>{entry.delta > 0 ? "+" : ""}{entry.delta}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{entry.balance.toLocaleString("en")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-400">Need to cancel or update payment method? <Link href="#" className="text-ocean hover:underline">Open Stripe portal</Link> via the actions above.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-navy">{value}</dd>
    </div>
  );
}

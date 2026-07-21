import Link from "next/link";
import { listMarineVesselRows, toMarineVesselRowView } from "@/lib/marine-row-data";
import { MarineDbTable } from "@/components/marine/MarineDbTable";
import { VesselFilterPanel } from "@/components/marine/VesselFilterPanel";
import { getServerSession } from "@/lib/api";

export const dynamic = "force-dynamic";

function summaryNumber(value: number) {
  return value.toLocaleString("en");
}

function buildPageHref(searchParams: Record<string, string | string[] | undefined>, page: number) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page") continue;
    if (typeof value === "string" && value.length > 0) params.set(key, value);
  }
  params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/dashboard/marine-db?${qs}` : "/dashboard/marine-db";
}

export default async function MarineDbPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const pageParam = Number(typeof searchParams.page === "string" ? searchParams.page : "1");
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;
  const q = typeof searchParams.q === "string" ? searchParams.q : "";

  const session = await getServerSession();
  const isSuperAdmin = session?.user.isSuperAdmin ?? false;

  const { rows, summary, pagination, query } = await listMarineVesselRows({ page, q, searchParams });
  const vesselViews = rows.map(toMarineVesselRowView);

  const summaryCards = [
    { label: "Vessels", value: summary.totalVessels },
    { label: "Contacts matched", value: summary.totalContactsMatched },
    { label: "Match values", value: summary.totalDomainsMatched },
    { label: "Showing", value: summary.displayedVessels },
  ];

  const startRow = (pagination.page - 1) * pagination.pageSize + 1;
  const endRow = Math.min(pagination.page * pagination.pageSize, pagination.total);

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-[#202026] dark:bg-[#0B0B0E]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-ocean dark:text-accent-300">Marine DB</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white/90">Ships with associated contacts</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600 dark:text-white/60">
            One row per vessel. Expand a row to see contacts matched by company website, exact email, business email
            domain, or company name.
          </p>
        </div>
        {isSuperAdmin ? (
          <Link
            href="/dashboard/import"
            className="rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ocean dark:bg-[#17171C] dark:hover:bg-[#20202A]"
          >
            Import CSV
          </Link>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <VesselFilterPanel searchParams={searchParams} basePath="/dashboard/marine-db" />
        <div className="min-w-0 space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-[#202026] dark:bg-[#0B0B0E] dark:shadow-none">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white/90">{summaryNumber(card.value)}</p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-[#202026] dark:bg-[#0B0B0E] dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-[#202026]">
          <div>
            <p className="text-sm font-semibold text-slate-950 dark:text-white/90">Vessels</p>
            <p className="text-xs text-slate-500 dark:text-white/45">
              {pagination.total === 0
                ? "0 vessels"
                : `Showing ${summaryNumber(startRow)}–${summaryNumber(endRow)} of ${summaryNumber(pagination.total)}`}
            </p>
          </div>
          <form className="flex items-center gap-2" action="/dashboard/marine-db">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search vessel, IMO, flag, owner…"
              className="w-64 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-ocean dark:border-[#262631] dark:bg-[#08080B] dark:text-white/85 dark:placeholder:text-white/35 dark:focus:border-accent-300"
            />
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-slate-800 dark:bg-[#14213d] dark:hover:bg-[#1b2b4f]"
            >
              Search
            </button>
          </form>
        </div>

        <MarineDbTable rows={vesselViews} />

        {pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-[#202026]">
            <p className="text-slate-500 dark:text-white/45">
              Page {pagination.page} of {pagination.totalPages}
            </p>
            <div className="flex items-center gap-2">
              {pagination.page > 1 ? (
                <Link
                  href={buildPageHref(searchParams, pagination.page - 1)}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm transition-colors hover:bg-slate-50 dark:border-[#262631] dark:text-white/70 dark:hover:bg-[#17171C]"
                >
                  Previous
                </Link>
              ) : (
                <span className="rounded-md border border-slate-100 px-3 py-1.5 text-sm text-slate-300 dark:border-[#1A1A20] dark:text-white/25">Previous</span>
              )}
              {pagination.page < pagination.totalPages ? (
                <Link
                  href={buildPageHref(searchParams, pagination.page + 1)}
                  className="rounded-md border border-slate-200 px-3 py-1.5 text-sm transition-colors hover:bg-slate-50 dark:border-[#262631] dark:text-white/70 dark:hover:bg-[#17171C]"
                >
                  Next
                </Link>
              ) : (
                <span className="rounded-md border border-slate-100 px-3 py-1.5 text-sm text-slate-300 dark:border-[#1A1A20] dark:text-white/25">Next</span>
              )}
            </div>
          </div>
        ) : null}
      </section>
        </div>
      </div>
    </div>
  );
}

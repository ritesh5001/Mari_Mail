import Link from "next/link";
import { AlertCircle, CalendarClock, FileUp, Ship } from "lucide-react";
import { prisma } from "@marimail/db";
import { VesselFilterPanel } from "@/components/marine/VesselFilterPanel";
import { VesselTable } from "@/components/marine/VesselViews";
import { AddVesselButton } from "@/components/marine/AddVesselButton";
import { getServerSession } from "@/lib/api";
import { listVessels } from "@/lib/marine-data";
import { VESSEL_SCHEMA_HEADERS } from "@/lib/vessel-schema";

export default async function VesselsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const [session, { vessels, count, error }] = await Promise.all([
    getServerSession(),
    listVessels(searchParams),
  ]);
  const targetPortCountry = session?.activeWorkspace?.targetPortCountry ?? null;
  const isSuperAdmin = session?.user.isSuperAdmin ?? false;
  // Look up the human-readable country name so the header can read
  // "X vessels found in Togo" instead of just the count.
  const targetCountryName = targetPortCountry
    ? (
        await prisma.port.findFirst({
          where: { country: targetPortCountry },
          select: { countryName: true },
        })
      )?.countryName ?? null
    : null;
  const countLabel = error
    ? "Failed to load"
    : `${count.toLocaleString()} vessel${count === 1 ? "" : "s"} found${targetCountryName ? ` in ${targetCountryName}` : ""}`;

  return (
    <div className="space-y-5">
      <VesselFilterPanel searchParams={searchParams} orientation="horizontal" />
      <section className="min-w-0 space-y-5">
        {/* Header */}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-sm font-semibold uppercase tracking-wide text-ocean">Vessel Finder</p>
          <div className="mt-2 flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">
                {countLabel}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-white/55">
                Search and review the full vessel schema across AIS, capacity, ownership, manager, builder, class, and operator fields.
              </p>
            </div>
            {isSuperAdmin ? (
              <div className="flex items-center gap-2">
                <AddVesselButton />
                <Link
                  href="/dashboard/vessels/eta-upload"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/[0.06]"
                >
                  <CalendarClock className="h-4 w-4" />
                  Update ETAs
                </Link>
                <Link
                  href="/dashboard/import"
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-white/60 dark:hover:bg-white/[0.06]"
                >
                  <FileUp className="h-4 w-4" />
                  Import CSV
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        {/* Database error state */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800/40 dark:bg-red-900/15">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="font-semibold text-red-700 dark:text-red-400">Failed to load vessels</p>
              <p className="mt-0.5 text-sm text-red-600 dark:text-red-400/80">{error}</p>
              <p className="mt-1 text-sm text-red-600/70 dark:text-red-400/60">
                Check that the database connection is healthy on the{" "}
                <Link href="/dashboard" className="underline">system status page</Link>.
              </p>
            </div>
          </div>
        )}

        {/* Empty state — no data at all */}
        {!error && count === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white py-16 text-center dark:border-white/10 dark:bg-white/[0.02]">
            <Ship className="mb-4 h-12 w-12 text-slate-300 dark:text-white/20" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              No vessels match the current filters
            </h3>
            <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-white/50">
              {targetCountryName
                ? `No upcoming ETAs in ${targetCountryName} match these filters. Try widening the destination country or clearing the ETA window.`
                : "Try widening the filters or pick a target port country to scope the search."}
            </p>
            {isSuperAdmin ? (
              <>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <AddVesselButton />
                  <Link
                    href="/dashboard/import"
                    className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08]"
                  >
                    <FileUp className="h-4 w-4" />
                    Import CSV
                  </Link>
                </div>
                <p className="mt-6 text-xs text-slate-400 dark:text-white/30">
                  CSV columns: {VESSEL_SCHEMA_HEADERS.join(", ")}
                </p>
              </>
            ) : null}
          </div>
        )}

        {/* Results */}
        {!error && count > 0 && <VesselTable vessels={vessels} isSuperAdmin={isSuperAdmin} />}
      </section>
    </div>
  );
}

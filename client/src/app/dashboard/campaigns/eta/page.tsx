import Link from "next/link";
import { Plus } from "lucide-react";
import { CampaignCard } from "@/components/campaigns/CampaignBuilder";
import { WorkerHealthCard } from "@/components/campaigns/WorkerHealthCard";
import { getCampaignDashboardData } from "@/lib/campaign-data";

export const dynamic = "force-dynamic";

export default async function EtaCampaignsPage() {
  const data = await getCampaignDashboardData("ETA_BASED");
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">ETA-based campaigns</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
            Trigger every time a vessel in your target list gets an ETA. Pick vessels from the ETA Radar, add them to a list, then bind it here.
          </p>
        </div>
        <Link
          href="/dashboard/campaigns/eta/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-[#4F6DFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3B4FE6]"
        >
          <Plus className="h-4 w-4" />
          New ETA campaign
        </Link>
      </header>

      <section className="grid gap-4 xl:grid-cols-2">
        {data.campaigns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500 xl:col-span-2 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/60">
            No ETA-based campaigns yet.
          </div>
        ) : (
          data.campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)
        )}
      </section>

      <WorkerHealthCard />
    </div>
  );
}

"use client";

import { X } from "lucide-react";
import { CampaignByRolePanel } from "@/components/lists/ListViews";
import type { StagedGroup } from "@/lib/campaign-data";

/**
 * Wraps the list page's Apollo role picker so the campaign Leads tab can pull
 * in new people for a staged vessel without leaving the campaign. The panel
 * adds contacts to the campaign's target list, which stages them for review —
 * so no campaign-specific endpoint is needed here.
 */
export function ApolloVesselSearchModal({
  group,
  contactListId,
  listName,
  onClose,
}: {
  group: StagedGroup;
  contactListId: string;
  listName: string;
  onClose: () => void;
}) {
  const company = group.companyNames[0] ?? "this vessel's company";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-8 w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.2)] dark:border-white/10 dark:bg-[#0F0D14]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Find more people at {company}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
              {group.vessel ? `${group.vessel.vesselName} · ` : ""}Anyone you add lands in{" "}
              <strong>{listName}</strong> and appears in the review queue below — they aren&rsquo;t
              emailed until you confirm them.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-white/50 dark:hover:bg-white/[0.06] dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          <CampaignByRolePanel listId={contactListId} listName={listName} />
        </div>
      </div>
    </div>
  );
}

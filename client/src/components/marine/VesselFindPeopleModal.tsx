"use client";

import { X } from "lucide-react";
import { CampaignByRolePanel } from "@/components/lists/ListViews";

/**
 * "Find people" for a Port Radar selection.
 *
 * Reaching the role search used to mean leaving Port Radar entirely: Lists →
 * open the list → New Vessels tab → filter → search. Six steps, with the
 * vessel context on a different screen from where the work started.
 *
 * The panel is list-scoped by design — it searches the companies behind a
 * list's vessels and adds whoever it finds back to that list — so the caller
 * puts the selection on a list first and hands the id straight through. That
 * is a deliberate constraint rather than a workaround: contacts that land
 * nowhere can't be bound to a campaign afterwards.
 *
 * `vesselIds` narrows the search to just the ships that were selected, so a
 * long-standing list doesn't drag its whole history into today's results.
 */
export function VesselFindPeopleModal({
  listId,
  listName,
  vesselIds,
  onClose,
}: {
  listId: string;
  listName: string;
  vesselIds: string[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="mt-8 w-full max-w-4xl rounded-lg border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.2)] dark:border-white/10 dark:bg-[#0F0D14]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              Find people at {vesselIds.length === 1 ? "this vessel" : "these vessels"}&rsquo;{" "}
              {vesselIds.length === 1 ? "owner" : "owners"} and managers
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-white/60">
              Searching the companies behind{" "}
              {vesselIds.length === 1 ? "1 vessel" : `${vesselIds.length} vessels`}. Anyone you add
              lands in <strong>{listName}</strong>.
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
          <CampaignByRolePanel listId={listId} listName={listName} vesselIds={vesselIds} />
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { VesselAddToListModal } from "@/components/marine/VesselAddToListModal";

export type MissedOpportunityAlert = {
  id: string;
  vesselId: string;
  vesselImo: string;
  vesselName: string;
  portName: string;
  etaLabel: string;
};

/**
 * Missed opportunities banner. Each vessel is checkbox-selectable so the user
 * can bulk-add them to a list — the whole point of the banner is to convert
 * "unassigned imminent ETAs" into campaign targets, so we surface the same
 * add-to-list action the main table has.
 */
export function MissedOpportunitiesBanner({
  countryLabel,
  alerts,
}: {
  countryLabel: string;
  alerts: MissedOpportunityAlert[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const selectedVesselIds = Array.from(selected);

  function toggle(vesselId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(vesselId)) next.delete(vesselId);
      else next.add(vesselId);
      return next;
    });
  }

  if (alerts.length === 0) return null;

  return (
    <>
      {showModal ? (
        <VesselAddToListModal
          vesselIds={selectedVesselIds}
          onClose={() => setShowModal(false)}
          onDone={(listName, added) => {
            setShowModal(false);
            setSelected(new Set());
            setToast(`${added} vessel${added !== 1 ? "s" : ""} added to "${listName}"`);
            setTimeout(() => setToast(null), 4000);
          }}
        />
      ) : null}
      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg">
          {toast}
        </div>
      ) : null}
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 dark:border-amber-800/40 dark:bg-amber-900/15">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" /> {countryLabel} missed opportunities
            </h3>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/80">
              {countryLabel}-port vessels arriving in &lt; 48h with no campaign assigned. Select any to add to a list.
            </p>
          </div>
          <button
            type="button"
            onClick={() => selectedVesselIds.length > 0 && setShowModal(true)}
            disabled={selectedVesselIds.length === 0}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-40 dark:border-amber-500/40 dark:bg-white/[0.04] dark:text-amber-100"
          >
            Add to list{selectedVesselIds.length > 0 ? ` (${selectedVesselIds.length})` : ""}
          </button>
        </div>
        <ul className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {alerts.map((alert) => {
            const isSelected = selected.has(alert.vesselId);
            return (
              <li
                key={alert.id}
                className={`rounded-md p-2 shadow-sm ${
                  isSelected ? "bg-white ring-2 ring-amber-400" : "bg-white dark:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(alert.vesselId)}
                    className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    aria-label={`Select ${alert.vesselName}`}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/vessels/${alert.vesselImo}`}
                      className="block truncate font-semibold text-navy hover:underline dark:text-white/90"
                    >
                      {alert.vesselName}
                    </Link>
                    <p className="mt-0.5 truncate text-slate-600 dark:text-white/55">
                      {alert.portName} · {alert.etaLabel}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

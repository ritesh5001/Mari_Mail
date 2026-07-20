import { EtaCsvUploader } from "@/components/marine/EtaCsvUploader";

export const metadata = {
  title: "Update ETAs from CSV · MariMail",
};

export default function EtaCsvUploadPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <p className="text-sm font-semibold uppercase tracking-wide text-ocean">ETA Refresh</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
          Update vessel ETAs from a CSV
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-white/60">
          Upload a CSV with one row per vessel. We match each row to a vessel by IMO number, then
          update its latest ETA. Matching includes vessels visible from the global vessel database;
          unknown IMOs are skipped — no new ships are created.
        </p>
        <ul className="mt-4 space-y-1.5 text-sm text-slate-600 dark:text-white/60">
          <li>
            <span className="font-medium text-slate-900 dark:text-white">IMO</span> — 7-digit IMO
            number of the vessel (required)
          </li>
          <li>
            <span className="font-medium text-slate-900 dark:text-white">ETA</span> — ISO 8601
            timestamp in UTC, e.g. <code>2026-06-15T08:00:00Z</code> (required)
          </li>
          <li>
            <span className="font-medium text-slate-900 dark:text-white">Destination Port</span> —
            UN/LOCODE or port name (optional; used when creating a first ETA or changing ports)
          </li>
        </ul>
      </div>

      <EtaCsvUploader />
    </div>
  );
}

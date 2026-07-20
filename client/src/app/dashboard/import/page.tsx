import { CsvImportForm } from "@/components/marine/CsvImportForm";

export default function ImportPage() {
  return (
    <section className="mx-auto max-w-4xl overflow-hidden rounded-xl border border-sky-100/80 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.08)]">
      <div className="h-1 bg-gradient-to-r from-sky-700 via-blue-600 to-cyan-500" />
      <div className="p-6 sm:p-7">
        <p className="text-sm font-semibold uppercase tracking-wide text-sky-700">CSV Import</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-950">Import vessels, contacts, and marine data</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Upload a CSV file or paste rows directly. Vessel and contact imports use the full schemas and auto-map common headers.
        </p>
        <div className="mt-6">
          <CsvImportForm />
        </div>
      </div>
    </section>
  );
}

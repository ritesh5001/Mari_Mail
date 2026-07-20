"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, RefreshCw, Upload } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import { CONTACT_SCHEMA_HEADERS } from "@/lib/contact-schema";
import { VESSEL_SCHEMA_FIELDS, VESSEL_TEMPLATE_CSV } from "@/lib/vessel-schema";

const IGNORE_FIELD = "__IGNORE__";

type ImportType =
  | "MARINE_DATA_ROWS"
  | "VESSELS"
  | "SHIP_OWNER_COMPANIES"
  | "ISM_MANAGER_COMPANIES"
  | "COMMERCIAL_MANAGER_COMPANIES"
  | "CONTACTS"
  | "VESSEL_ETAS";

type ImportResult = {
  created: number;
  updated?: number;
  errors: Array<{ row: number; message: string }>;
};

type ImportJob = {
  jobId: string;
  status: string;
  rowCount?: number;
  failedReason?: string;
  result?: ImportResult;
};

type PreviewField = {
  label: string;
  required: boolean;
  aliases: string[];
  matchedCsvHeader: string | null;
  status: "exact" | "alias" | "suggested" | "user" | "unmapped" | "ignored";
};

type ImportPreview = {
  detectedHeaders: string[];
  csvHeaders: Array<{ header: string; samples: string[] }>;
  rowCount: number;
  schemaFields: PreviewField[];
  unmappedCsvHeaders: string[];
  ignoredHeaders: string[];
  missingRequiredFields: string[];
  rowErrors: Array<{ row: number; field: string; value?: string; message: string }>;
  previewRows: Record<string, string | undefined>[];
  canImport: boolean;
};

const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  MARINE_DATA_ROWS: "Marine data rows",
  VESSELS: "Vessels",
  SHIP_OWNER_COMPANIES: "Ship Owner Companies",
  ISM_MANAGER_COMPANIES: "ISM Manager Companies",
  COMMERCIAL_MANAGER_COMPANIES: "Commercial Manager Companies",
  CONTACTS: "Contacts",
  VESSEL_ETAS: "Vessel ETAs",
};

const VESSEL_PRIORITY_FIELD_LABELS = new Set(
  VESSEL_SCHEMA_FIELDS.filter((field) => field.group === "Priority").map((field) => field.label),
);

async function readJson<T>(response: Response) {
  return (await response.json()) as T;
}

function mappingFromPreview(preview: ImportPreview, current: Record<string, string>) {
  const next: Record<string, string> = {};
  const validFields = new Set(preview.schemaFields.map((field) => field.label));
  for (const header of preview.detectedHeaders) {
    const currentValue = current[header];
    if (currentValue === IGNORE_FIELD || validFields.has(currentValue)) next[header] = currentValue;
  }
  return next;
}

function statusLabel(status: PreviewField["status"] | "ignored" | undefined) {
  if (!status) return "Unmapped";
  if (status === "exact") return "Exact";
  if (status === "alias") return "Alias";
  if (status === "suggested") return "Suggested";
  if (status === "user") return "Manual";
  if (status === "ignored") return "Ignored";
  return "Unmapped";
}

function statusClass(status: PreviewField["status"] | "ignored" | undefined) {
  if (status === "exact" || status === "alias" || status === "user") return "bg-emerald-50 text-emerald-700";
  if (status === "suggested") return "bg-amber-50 text-amber-700";
  if (status === "ignored") return "bg-slate-100 text-slate-500";
  return "bg-red-50 text-red-700";
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function firstCsvHeaders(csv: string) {
  const firstLine = csv.split(/\r?\n/).find((line) => line.trim());
  if (!firstLine) return [];
  return firstLine.split(",").map((header) => header.trim().replace(/^"|"$/g, ""));
}

function detectImportType(csv: string): ImportType | null {
  const headers = new Set(firstCsvHeaders(csv).map(normalizeText));
  if (headers.size === 0) return null;
  const has = (label: string) => headers.has(normalizeText(label));

  if (has("Destination Port") && (has("ETA") || has("ETA (UTC)")) && has("IMO")) return "VESSEL_ETAS";
  if (has("Vessel Name") && has("IMO")) return "VESSELS";
  if (has("ETA (UTC)") || has("Ship Owner") || has("Commercial Manager Phone") || has("ISM Manager Website")) return "VESSELS";
  if (has("First Name") && has("Last Name") && has("Email")) return "CONTACTS";
  return null;
}

export function CsvImportForm() {
  const [importType, setImportType] = useState<ImportType>("VESSELS");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pendingPreview, setPendingPreview] = useState(false);
  const [pendingImport, setPendingImport] = useState(false);
  const [mappingDirty, setMappingDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaFieldSearch, setSchemaFieldSearch] = useState("");
  const [importJob, setImportJob] = useState<ImportJob | null>(null);

  const fieldOptions = preview?.schemaFields.map((field) => field.label) ?? [];
  const visibleFieldOptions = useMemo(() => {
    const query = normalizeText(schemaFieldSearch);
    if (!query) return fieldOptions;
    return fieldOptions.filter((field) => normalizeText(field).includes(query));
  }, [fieldOptions, schemaFieldSearch]);
  const fieldsByHeader = useMemo(() => {
    const map = new Map<string, PreviewField>();
    for (const field of preview?.schemaFields ?? []) {
      if (field.matchedCsvHeader) map.set(field.matchedCsvHeader, field);
    }
    return map;
  }, [preview]);
  const priorityVesselFields = useMemo(() => {
    if (importType !== "VESSELS") return [];
    return (preview?.schemaFields ?? []).filter((field) => VESSEL_PRIORITY_FIELD_LABELS.has(field.label));
  }, [importType, preview]);
  const detectedImportType = useMemo(() => detectImportType(csv), [csv]);
  const importTypeMismatch = Boolean(detectedImportType && detectedImportType !== importType);

  function optionsForSelect(selectedValue: string) {
    if (selectedValue && selectedValue !== IGNORE_FIELD && !visibleFieldOptions.includes(selectedValue)) {
      return [selectedValue, ...visibleFieldOptions];
    }
    return visibleFieldOptions;
  }

  async function readCsvFile(file: File | undefined) {
    setError(null);
    setResult(null);
    setImportJob(null);
    setPreview(null);
    setMapping({});
    setMappingDirty(false);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setError("Please upload a CSV file.");
      return;
    }

    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
  }

  async function requestPreview(nextMapping = mapping) {
    setPendingPreview(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiFetch(`/api/import/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importType, csv, mapping: nextMapping }),
      });
      const payload = await readJson<{ data?: ImportPreview; error?: { message?: string } }>(response);
      if (!response.ok || !payload.data) {
        setError(payload.error?.message ?? "Unable to review CSV.");
        return;
      }
      setPreview(payload.data);
      setMapping(mappingFromPreview(payload.data, nextMapping));
      setMappingDirty(false);
    } catch {
      setError("Unable to review CSV. Please check your connection and try again.");
    } finally {
      setPendingPreview(false);
    }
  }

  async function importCsv() {
    if (!csv.trim()) return;
    setPendingImport(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiFetch(`/api/import/csv/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importType, csv, mapping }),
      });
      const payload = await readJson<{
        data?: { mode: "queued"; jobId: string; status: string; rowCount: number } | { mode: "sync"; result: ImportResult };
        error?: { message?: string; details?: ImportPreview };
      }>(response);
      if (!response.ok || !payload.data) {
        if (payload.error?.details) {
          setPreview(payload.error.details);
          setMapping(mappingFromPreview(payload.error.details, mapping));
          setMappingDirty(false);
        }
        setError(payload.error?.message ?? "Import failed.");
        return;
      }
      if (payload.data.mode === "sync") {
        setResult(payload.data.result);
        setImportJob(null);
      } else {
        setResult(null);
        setImportJob({
          jobId: payload.data.jobId,
          status: payload.data.status,
          rowCount: payload.data.rowCount,
        });
      }
    } catch {
      setError("Import failed. Please check your connection and try again.");
    } finally {
      setPendingImport(false);
    }
  }

  function updateImportType(value: ImportType) {
    setImportType(value);
    setPreview(null);
    setResult(null);
    setImportJob(null);
    setMapping({});
    setMappingDirty(false);
    setSchemaFieldSearch("");
    setError(null);
  }

  function setHeaderMapping(header: string, field: string) {
    setMapping((previous) => {
      const next = { ...previous };
      if (!field) delete next[header];
      else next[header] = field;
      return next;
    });
    setResult(null);
    setImportJob(null);
    setMappingDirty(true);
  }

  const canStartImport = Boolean(csv.trim() && !pendingImport);
  const needsReview = Boolean(preview && (!preview.canImport || mappingDirty));

  useEffect(() => {
    if (!importJob?.jobId || ["completed", "failed"].includes(importJob.status)) return undefined;

    let cancelled = false;
    const poll = async () => {
      try {
        const response = await apiFetch(`/api/import/csv/jobs/${importJob.jobId}`, {
          });
        const payload = await readJson<{ data?: ImportJob; error?: { message?: string } }>(response);
        if (cancelled || !response.ok || !payload.data) return;
        setImportJob(payload.data);
        if (payload.data.status === "completed" && payload.data.result) {
          setResult(payload.data.result);
        }
        if (payload.data.status === "failed") {
          setError(payload.data.failedReason ?? "Background import failed.");
        }
      } catch {
        // Keep the queued status visible; the server job can continue even if polling fails.
      }
    };

    const interval = window.setInterval(() => void poll(), 3000);
    void poll();
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [importJob?.jobId, importJob?.status]);

  return (
    <div className="space-y-5">
      <label className="block text-sm font-medium text-slate-700">
        Import type
        <select
          value={importType}
          onChange={(event) => updateImportType(event.target.value as ImportType)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
        >
          <option value="MARINE_DATA_ROWS">Marine data rows</option>
          <option value="VESSELS">Vessels</option>
          <option value="SHIP_OWNER_COMPANIES">Ship Owner Companies</option>
          <option value="ISM_MANAGER_COMPANIES">ISM Manager Companies</option>
          <option value="COMMERCIAL_MANAGER_COMPANIES">Commercial Manager Companies</option>
          <option value="CONTACTS">Contacts</option>
          <option value="VESSEL_ETAS">Vessel ETAs</option>
        </select>
      </label>

      {importTypeMismatch && detectedImportType ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>
            This CSV looks like {IMPORT_TYPE_LABELS[detectedImportType]}. Switch import type to see the matching schema fields.
          </span>
          <button
            type="button"
            onClick={() => updateImportType(detectedImportType)}
            className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm hover:bg-amber-100"
          >
            Use {IMPORT_TYPE_LABELS[detectedImportType]}
          </button>
        </div>
      ) : null}

      <label className="block rounded-lg border border-dashed border-sky-200/80 bg-sky-50/40 px-4 py-5 text-sm text-slate-700 shadow-sm transition-colors hover:border-sky-400 hover:bg-sky-50">
        <span className="flex items-center gap-2 font-semibold text-slate-900">
          <Upload className="h-4 w-4 text-sky-700" />
          Upload CSV file
        </span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          Choose a CSV file. The review step will help match different header names to the selected import schema.
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-sky-700 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-sky-600"
          onChange={(event) => void readCsvFile(event.target.files?.[0])}
        />
        {fileName ? (
          <span className="mt-2 inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
            Loaded {fileName}
          </span>
        ) : null}
      </label>

      <label className="block text-sm font-medium text-slate-700">
        CSV data
        <textarea
          value={csv}
          onChange={(event) => {
            setCsv(event.target.value);
            setPreview(null);
            setResult(null);
            setImportJob(null);
            setMappingDirty(false);
            setSchemaFieldSearch("");
          }}
          rows={12}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
          placeholder={`${VESSEL_TEMPLATE_CSV}\n${CONTACT_SCHEMA_HEADERS.join(",")}\nElena,Pappas,Fleet Manager,Oceanic Technical Management,elena@example.com,Operations;Technical,Ritesh,+30 210 000 0100,+30 690 000 0101,+30 210 000 0102,+30 210 000 0103,https://linkedin.com/in/elena,https://example.com,https://linkedin.com/company/oceanic,Greece,Parent Shipping Ltd.,elena.secondary@example.com,SF-001`}
          required
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!csv.trim() || pendingPreview}
          onClick={() => void requestPreview()}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${pendingPreview ? "animate-spin" : ""}`} />
          {pendingPreview ? "Reviewing..." : "Review headers"}
        </button>
        <button
          type="button"
          disabled={!canStartImport}
          onClick={() => void importCsv()}
          className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-sky-700 to-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(2, 132, 199,0.24)] transition-all hover:-translate-y-0.5 hover:from-sky-600 hover:to-blue-600 disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-300 disabled:text-white disabled:shadow-none"
        >
          <Upload className="h-4 w-4" />
          {pendingImport ? "Submitting..." : "Start background import"}
        </button>
        {needsReview ? <span className="text-xs font-medium text-amber-700">Import will check these mappings before queuing.</span> : null}
      </div>

      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {importJob ? (
        <div className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-800">
          Background import job {importJob.jobId} is {importJob.status}
          {importJob.rowCount ? ` for ${importJob.rowCount.toLocaleString("en")} rows` : ""}.
          {importJob.status === "completed" ? " Import completed." : " You can leave this page after the job is queued; the server worker will continue."}
        </div>
      ) : null}

      {preview ? (
        <section className="space-y-4 rounded-lg border border-sky-100 bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Header review</p>
              <p className="mt-1 text-xs text-slate-500">
                {preview.rowCount} row{preview.rowCount === 1 ? "" : "s"} detected. Please match these fields before importing.
              </p>
            </div>
            {preview.canImport ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Ready to import
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                <AlertCircle className="h-3.5 w-3.5" /> Needs fixes
              </span>
            )}
          </div>

          {preview.missingRequiredFields.length > 0 ? (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Missing required mappings: {preview.missingRequiredFields.join(", ")}
            </div>
          ) : null}

          {preview.rowErrors.length > 0 ? (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              <p className="font-semibold">Fix these row values, then preview again.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                {preview.rowErrors.slice(0, 8).map((item) => (
                  <li key={`${item.row}:${item.field}:${item.message}`}>
                    Row {item.row}, {item.field}: {item.message}
                    {item.value ? ` (${item.value})` : ""}
                  </li>
                ))}
                {preview.rowErrors.length > 8 ? <li>{preview.rowErrors.length - 8} more row errors not shown.</li> : null}
              </ul>
            </div>
          ) : null}

          {priorityVesselFields.length > 0 ? (
            <div className="rounded-md border border-sky-100 bg-sky-50/35 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available vessel fields</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {priorityVesselFields.map((field) => (
                  <span
                    key={field.label}
                    className={`rounded px-2 py-1 text-xs font-medium ${
                      field.matchedCsvHeader ? "bg-emerald-50 text-emerald-700" : "bg-white text-slate-600 ring-1 ring-slate-200"
                    }`}
                    title={field.matchedCsvHeader ? `Matched to ${field.matchedCsvHeader}` : "Available to map"}
                  >
                    {field.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {fieldOptions.length > 12 ? (
            <label className="block text-sm font-medium text-slate-700">
              Search schema fields
              <input
                value={schemaFieldSearch}
                onChange={(event) => setSchemaFieldSearch(event.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                placeholder="Find ETA, Ship Owner Phone, Commercial Manager Website..."
              />
            </label>
          ) : null}

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-[900px] divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">CSV header</th>
                  <th className="px-3 py-2">Matched schema field</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Sample values</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.csvHeaders.map(({ header, samples }) => {
                  const matchedField = fieldsByHeader.get(header);
                  const hasManualMapping = Object.prototype.hasOwnProperty.call(mapping, header);
                  const selectedValue = hasManualMapping ? mapping[header] : matchedField?.label ?? "";
                  const status = selectedValue === IGNORE_FIELD ? "ignored" : hasManualMapping ? "user" : matchedField?.status;
                  return (
                    <tr key={header}>
                      <td className="px-3 py-2 font-medium text-slate-800">{header}</td>
                      <td className="px-3 py-2">
                        <select
                          value={selectedValue}
                          onChange={(event) => setHeaderMapping(header, event.target.value)}
                          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                        >
                          <option value="">Unmapped</option>
                          <option value={IGNORE_FIELD}>Ignore</option>
                          {optionsForSelect(selectedValue).map((field) => (
                            <option key={field} value={field}>{field}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded px-2 py-1 text-xs font-semibold ${statusClass(status)}`}>
                          {statusLabel(status)}
                        </span>
                      </td>
                      <td className="max-w-[360px] truncate px-3 py-2 text-slate-500" title={samples.join(", ")}>
                        {samples.length > 0 ? samples.join(", ") : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {preview.previewRows.length > 0 ? (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Preview rows normalized: {preview.previewRows.length}
            </div>
          ) : null}
        </section>
      ) : null}

      {result ? (
        <div className={`rounded-md px-3 py-2 text-sm ${result.errors.length > 0 ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
          Imported {result.created} new rows and updated {result.updated ?? 0}. Errors: {result.errors.length}
        </div>
      ) : null}
    </div>
  );
}

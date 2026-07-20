"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Upload } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

const TEMPLATE_HEADERS = [
  "firstName",
  "lastName",
  "email",
  "companyName",
  "title",
  "country",
  "website",
  "phone",
] as const;

const TEMPLATE_SAMPLE = [
  "Anna",
  "Iyer",
  "anna.iyer@example.com",
  "Example Shipping Pvt Ltd",
  "Procurement Manager",
  "IN",
  "example.com",
  "+91 98765 43210",
];

type ParsedRow = Record<(typeof TEMPLATE_HEADERS)[number], string>;

/**
 * Minimal RFC 4180-ish CSV parser: handles quoted fields, embedded quotes
 * (""), and CRLF/LF line endings. Sufficient for user-authored contact lists
 * exported from Excel/Sheets; not intended to cover every CSV quirk.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0].trim() !== ""));
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_]+/g, "");
}

const HEADER_ALIASES: Record<string, (typeof TEMPLATE_HEADERS)[number]> = {
  firstname: "firstName",
  first: "firstName",
  fname: "firstName",
  givenname: "firstName",
  lastname: "lastName",
  last: "lastName",
  lname: "lastName",
  surname: "lastName",
  familyname: "lastName",
  email: "email",
  emailaddress: "email",
  mail: "email",
  companyname: "companyName",
  company: "companyName",
  organization: "companyName",
  organisation: "companyName",
  title: "title",
  jobtitle: "title",
  role: "title",
  country: "country",
  countrycode: "country",
  website: "website",
  domain: "website",
  url: "website",
  phone: "phone",
  mobile: "phone",
  mobilephone: "phone",
  telephone: "phone",
};

function mapHeader(header: string): (typeof TEMPLATE_HEADERS)[number] | null {
  const normalized = normalizeHeader(header);
  return HEADER_ALIASES[normalized] ?? null;
}

/**
 * CSV import section shown on the detail page of a Contact-kind list.
 * Provides a downloadable template that matches the exact schema the server
 * accepts, and a client-side CSV parser that normalizes header names before
 * POSTing rows. Only rows with a valid email survive validation.
 */
export function ImportContactsCsvSection({ listId }: { listId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "parsing" }
    | { kind: "uploading"; count: number }
    | { kind: "error"; message: string }
    | { kind: "done"; created: number; linked: number; totalRows: number; skipped: number }
  >({ kind: "idle" });

  function downloadTemplate() {
    // Include a sample row so the format is unambiguous. Blob → object URL
    // keeps the template purely client-side (no server round-trip).
    const csv = [TEMPLATE_HEADERS.join(","), TEMPLATE_SAMPLE.join(",")].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contact-list-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    setStatus({ kind: "parsing" });
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length < 2) {
        setStatus({ kind: "error", message: "CSV needs a header row plus at least one data row." });
        return;
      }
      const headers = rows[0];
      const columnMap = headers.map(mapHeader);
      if (!columnMap.includes("email")) {
        setStatus({
          kind: "error",
          message: "Couldn't find an email column. Header must contain \"email\" (or a common alias).",
        });
        return;
      }

      const parsed: ParsedRow[] = [];
      let skippedInvalid = 0;
      for (let i = 1; i < rows.length; i += 1) {
        const raw = rows[i];
        const record: ParsedRow = {
          firstName: "",
          lastName: "",
          email: "",
          companyName: "",
          title: "",
          country: "",
          website: "",
          phone: "",
        };
        for (let col = 0; col < raw.length; col += 1) {
          const key = columnMap[col];
          if (!key) continue;
          record[key] = (raw[col] ?? "").trim();
        }
        if (!record.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(record.email)) {
          skippedInvalid += 1;
          continue;
        }
        parsed.push(record);
      }

      if (parsed.length === 0) {
        setStatus({ kind: "error", message: "No rows had a valid email — nothing to import." });
        return;
      }
      if (parsed.length > 500) {
        setStatus({
          kind: "error",
          message: `Too many rows in one upload (${parsed.length}). Split into files of ≤500 rows.`,
        });
        return;
      }

      setStatus({ kind: "uploading", count: parsed.length });
      const res = await apiFetch(`/api/lists/${listId}/import-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed }),
      });
      const payload = (await res.json().catch(() => null)) as
        | { data?: { created: number; linked: number; totalRows: number }; error?: { message?: string } }
        | null;
      if (!res.ok || !payload?.data) {
        setStatus({ kind: "error", message: payload?.error?.message ?? "Import failed" });
        return;
      }
      setStatus({
        kind: "done",
        created: payload.data.created,
        linked: payload.data.linked,
        totalRows: payload.data.totalRows,
        skipped: skippedInvalid,
      });
      router.refresh();
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to read file",
      });
    }
  }

  const busy = status.kind === "parsing" || status.kind === "uploading";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.06] dark:bg-[#0A0A0C]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950 dark:text-white">Import contacts from CSV</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-white/60">
            Upload a CSV with your contacts. The template shows the exact columns we accept.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-ocean hover:text-ocean dark:border-white/10 dark:text-white/80"
          >
            <Download className="h-3.5 w-3.5" />
            Download template
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Reset so re-selecting the same file still triggers onChange.
              event.target.value = "";
              if (file) void handleFile(file);
            }}
          />
        </div>
      </div>

      {status.kind === "error" ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs font-medium text-red-700">
          {status.message}
        </p>
      ) : null}
      {status.kind === "uploading" ? (
        <p className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
          Uploading {status.count} rows…
        </p>
      ) : null}
      {status.kind === "done" ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs font-medium text-emerald-800">
          Imported {status.linked} of {status.totalRows} rows into this list ({status.created} new
          contact{status.created === 1 ? "" : "s"} created
          {status.skipped > 0 ? `, ${status.skipped} skipped for missing/invalid email` : ""}).
        </p>
      ) : null}
    </section>
  );
}

"use client";

import { useMemo, useState, useTransition } from "react";
import { Calendar, Download, Mail, Phone, Power, Save, Trash2, UserPlus } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

type BookingStatus = "PENDING" | "CONTACTED" | "SCHEDULED" | "COMPLETED" | "CANCELLED";

type Booking = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  role: string | null;
  fleetSize: string | null;
  message: string | null;
  preferredAt: string | null;
  timezone: string | null;
  status: BookingStatus;
  notes: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
};

type Settings = {
  id: string;
  enabled: boolean;
  registrationEnabled: boolean;
  adminEmail: string | null;
  successMessage: string;
};

const statusOrder: BookingStatus[] = ["PENDING", "CONTACTED", "SCHEDULED", "COMPLETED", "CANCELLED"];

const statusStyles: Record<BookingStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  CONTACTED: "bg-sky-100 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300",
  SCHEDULED: "bg-sky-100 text-sky-800 dark:bg-sky-500/10 dark:text-sky-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  CANCELLED: "bg-slate-200 text-slate-700 dark:bg-white/10 dark:text-white/60",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const csvColumns: Array<{ header: string; accessor: (b: Booking) => string | null }> = [
  { header: "Name", accessor: (b) => b.name },
  { header: "Email", accessor: (b) => b.email },
  { header: "Company", accessor: (b) => b.company },
  { header: "Phone", accessor: (b) => b.phone },
  { header: "Role", accessor: (b) => b.role },
  { header: "Fleet size", accessor: (b) => b.fleetSize },
  { header: "Status", accessor: (b) => b.status },
  { header: "Preferred at", accessor: (b) => b.preferredAt },
  { header: "Timezone", accessor: (b) => b.timezone },
  { header: "Source", accessor: (b) => b.source },
  { header: "Message", accessor: (b) => b.message },
  { header: "Notes", accessor: (b) => b.notes },
  { header: "Created at", accessor: (b) => b.createdAt },
  { header: "Updated at", accessor: (b) => b.updatedAt },
];

function escapeCsvCell(value: string | null): string {
  if (value === null || value === undefined) return "";
  const needsQuoting = /[",\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

function buildCsv(rows: Booking[]): string {
  const header = csvColumns.map((c) => escapeCsvCell(c.header)).join(",");
  const body = rows
    .map((row) => csvColumns.map((c) => escapeCsvCell(c.accessor(row))).join(","))
    .join("\r\n");
  return body ? `${header}\r\n${body}\r\n` : `${header}\r\n`;
}

function downloadCsv(rows: Booking[], filenameSuffix: string) {
  // Prepend a BOM so Excel opens the file as UTF-8 instead of Latin-1.
  const csv = "﻿" + buildCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `demo-bookings-${filenameSuffix}-${stamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function DemoBookingsAdmin({
  initialBookings,
  initialSettings,
  initialSummary,
}: {
  initialBookings: Booking[];
  initialSettings: Settings;
  initialSummary: Record<string, number>;
}) {
  const [bookings, setBookings] = useState(initialBookings);
  const [settings, setSettings] = useState(initialSettings);
  const [summary, setSummary] = useState(initialSummary);
  const [filter, setFilter] = useState<BookingStatus | "ALL">("ALL");
  const [activeId, setActiveId] = useState<string | null>(initialBookings[0]?.id ?? null);
  const [adminEmail, setAdminEmail] = useState(initialSettings.adminEmail ?? "");
  const [successMessage, setSuccessMessage] = useState(initialSettings.successMessage);
  const [savingSettings, setSavingSettings] = useState(false);
  const [, startTransition] = useTransition();

  const filtered = useMemo(
    () => (filter === "ALL" ? bookings : bookings.filter((b) => b.status === filter)),
    [bookings, filter],
  );

  const active = bookings.find((b) => b.id === activeId) ?? filtered[0] ?? null;

  function recalcSummary(next: Booking[]) {
    const map: Record<string, number> = {};
    for (const b of next) {
      map[b.status] = (map[b.status] ?? 0) + 1;
    }
    setSummary(map);
  }

  async function toggleEnabled(next: boolean) {
    setSettings((s) => ({ ...s, enabled: next }));
    try {
      const response = await apiFetch(`/api/demo/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!response.ok) throw new Error("failed");
    } catch {
      // revert on failure
      setSettings((s) => ({ ...s, enabled: !next }));
    }
  }

  async function toggleRegistrationEnabled(next: boolean) {
    setSettings((s) => ({ ...s, registrationEnabled: next }));
    try {
      const response = await apiFetch(`/api/demo/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationEnabled: next }),
      });
      if (!response.ok) throw new Error("failed");
    } catch {
      setSettings((s) => ({ ...s, registrationEnabled: !next }));
    }
  }

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const response = await apiFetch(`/api/demo/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: adminEmail.trim() === "" ? null : adminEmail.trim(),
          successMessage: successMessage.trim(),
        }),
      });
      if (response.ok) {
        const payload = (await response.json()) as { data: Settings };
        setSettings(payload.data);
      }
    } finally {
      setSavingSettings(false);
    }
  }

  async function updateBooking(id: string, patch: Partial<Pick<Booking, "status" | "notes">>) {
    const previous = bookings;
    const optimistic = bookings.map((b) => (b.id === id ? { ...b, ...patch } : b));
    setBookings(optimistic);
    recalcSummary(optimistic);

    try {
      const response = await apiFetch(`/api/demo/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("failed");
      const payload = (await response.json()) as { data: Booking };
      const merged = optimistic.map((b) => (b.id === id ? payload.data : b));
      setBookings(merged);
      recalcSummary(merged);
    } catch {
      setBookings(previous);
      recalcSummary(previous);
    }
  }

  async function deleteBooking(id: string) {
    if (!confirm("Delete this booking? This cannot be undone.")) return;
    const previous = bookings;
    const next = bookings.filter((b) => b.id !== id);
    setBookings(next);
    recalcSummary(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);

    startTransition(async () => {
      try {
        const response = await apiFetch(`/api/demo/${id}`, {
          method: "DELETE",
        });
        if (!response.ok) throw new Error("failed");
      } catch {
        setBookings(previous);
        recalcSummary(previous);
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Demo Bookings</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950 dark:text-white">
              Manage incoming demo requests
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
              Submissions from the public <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-white/10">/book-demo</code> page.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const rows = filter === "ALL" ? bookings : filtered;
                if (rows.length === 0) return;
                downloadCsv(rows, filter === "ALL" ? "all" : filter.toLowerCase());
              }}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-white/20"
              title={
                filter === "ALL"
                  ? "Download all demo bookings as CSV"
                  : `Download ${filter.toLowerCase()} demo bookings as CSV`
              }
            >
              <Download className="h-4 w-4 text-slate-500 dark:text-white/60" />
              <span>Export CSV{filter === "ALL" ? "" : ` (${filter.toLowerCase()})`}</span>
            </button>

            <label className="inline-flex cursor-pointer select-none items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80">
              <Power className={`h-4 w-4 ${settings.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`} />
              <span>{settings.enabled ? "Accepting bookings" : "Bookings paused"}</span>
              <span className="relative">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={settings.enabled}
                  onChange={(event) => toggleEnabled(event.currentTarget.checked)}
                />
                <span className="block h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500 dark:bg-white/15" />
                <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
              </span>
            </label>

            <label className="inline-flex cursor-pointer select-none items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80">
              <UserPlus className={`h-4 w-4 ${settings.registrationEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`} />
              <span>{settings.registrationEnabled ? "Registration open" : "Registration paused"}</span>
              <span className="relative">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={settings.registrationEnabled}
                  onChange={(event) => toggleRegistrationEnabled(event.currentTarget.checked)}
                />
                <span className="block h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-emerald-500 dark:bg-white/15" />
                <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
              </span>
            </label>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-5">
          {statusOrder.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter((current) => (current === status ? "ALL" : status))}
              className={`rounded-lg border px-3 py-2 text-left transition ${
                filter === status
                  ? "border-sky-400 bg-sky-50 dark:border-accent-400/60 dark:bg-accent-500/10"
                  : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20"
              }`}
            >
              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-white/50">
                {status.toLowerCase()}
              </div>
              <div className="text-xl font-semibold text-slate-950 dark:text-white">{summary[status] ?? 0}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm dark:border-white/[0.06]">
            <span className="font-medium text-slate-700 dark:text-white/80">
              {filtered.length} {filter === "ALL" ? "total" : filter.toLowerCase()}
            </span>
            {filter !== "ALL" ? (
              <button
                type="button"
                onClick={() => setFilter("ALL")}
                className="text-xs text-sky-600 hover:underline dark:text-accent-300"
              >
                Clear filter
              </button>
            ) : null}
          </div>

          <ul className="max-h-[640px] divide-y divide-slate-100 overflow-y-auto dark:divide-white/[0.06]">
            {filtered.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-slate-500 dark:text-white/50">
                No bookings yet.
              </li>
            ) : (
              filtered.map((booking) => {
                const isActive = booking.id === active?.id;
                return (
                  <li key={booking.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(booking.id)}
                      className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition ${
                        isActive
                          ? "bg-sky-50 dark:bg-accent-500/10"
                          : "hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                            {booking.name}
                          </p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${statusStyles[booking.status]}`}>
                            {booking.status.toLowerCase()}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-white/55">
                          {booking.email}
                          {booking.company ? ` · ${booking.company}` : ""}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-[11px] text-slate-400 dark:text-white/40">
                        {formatDate(booking.createdAt)}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
          {active ? (
            <DetailPanel
              key={active.id}
              booking={active}
              onStatusChange={(status) => updateBooking(active.id, { status })}
              onNotesChange={(notes) => updateBooking(active.id, { notes })}
              onDelete={() => deleteBooking(active.id)}
            />
          ) : (
            <p className="py-10 text-center text-sm text-slate-500 dark:text-white/50">
              Select a booking to view details.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
          Notification settings
        </h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
          When someone books a demo, an email is sent to this address. Falls back to{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-white/10">DEMO_ADMIN_EMAIL</code> if unset.
        </p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-600 dark:text-white/70">Admin email</span>
            <input
              type="email"
              value={adminEmail}
              onChange={(event) => setAdminEmail(event.target.value)}
              placeholder="admin@yourcompany.com"
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
          </label>

          <label className="block text-sm">
            <span className="text-xs font-medium text-slate-600 dark:text-white/70">Success message (shown to user)</span>
            <input
              type="text"
              value={successMessage}
              onChange={(event) => setSuccessMessage(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={saveSettings}
            disabled={savingSettings}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
          >
            <Save className="h-4 w-4" />
            {savingSettings ? "Saving…" : "Save settings"}
          </button>
        </div>
      </section>
    </div>
  );
}

function DetailPanel({
  booking,
  onStatusChange,
  onNotesChange,
  onDelete,
}: {
  booking: Booking;
  onStatusChange: (status: BookingStatus) => void;
  onNotesChange: (notes: string) => void;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [savedNotes, setSavedNotes] = useState(booking.notes ?? "");
  const notesDirty = notes !== savedNotes;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950 dark:text-white">{booking.name}</h3>
          <p className="text-xs text-slate-500 dark:text-white/55">
            Submitted {formatDate(booking.createdAt)}
            {booking.timezone ? ` · ${booking.timezone}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
          aria-label="Delete booking"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 text-sm">
        <a href={`mailto:${booking.email}`} className="flex items-center gap-2 text-slate-700 hover:text-sky-700 dark:text-white/80 dark:hover:text-accent-300">
          <Mail className="h-4 w-4 text-slate-400" />
          {booking.email}
        </a>
        {booking.phone ? (
          <a href={`tel:${booking.phone}`} className="flex items-center gap-2 text-slate-700 hover:text-sky-700 dark:text-white/80 dark:hover:text-accent-300">
            <Phone className="h-4 w-4 text-slate-400" />
            {booking.phone}
          </a>
        ) : null}
        {booking.preferredAt ? (
          <div className="flex items-center gap-2 text-slate-700 dark:text-white/80">
            <Calendar className="h-4 w-4 text-slate-400" />
            Preferred: {formatDate(booking.preferredAt)}
          </div>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
        <Field label="Company" value={booking.company} />
        <Field label="Role" value={booking.role} />
        <Field label="Fleet" value={booking.fleetSize} />
        <Field label="Source" value={booking.source} />
      </dl>

      {booking.message ? (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-white/55">Message</div>
          <p className="mt-1.5 whitespace-pre-wrap rounded-lg border border-slate-100 bg-white p-3 text-sm text-slate-800 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/85">
            {booking.message}
          </p>
        </div>
      ) : null}

      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-white/55">Status</div>
        <div className="flex flex-wrap gap-1.5">
          {statusOrder.map((status) => {
            const active = booking.status === status;
            return (
              <button
                key={status}
                type="button"
                onClick={() => onStatusChange(status)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? statusStyles[status] + " ring-2 ring-sky-300 dark:ring-accent-400/40"
                    : "border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-white/10 dark:text-white/65 dark:hover:bg-white/[0.05]"
                }`}
              >
                {status.toLowerCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-white/55">Internal notes</div>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={4}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
          placeholder="Anything the team should know…"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            disabled={!notesDirty}
            onClick={() => {
              onNotesChange(notes);
              setSavedNotes(notes);
            }}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900"
          >
            Save notes
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-white/50">{label}</dt>
      <dd className="text-sm text-slate-900 dark:text-white/85">{value ?? "—"}</dd>
    </div>
  );
}

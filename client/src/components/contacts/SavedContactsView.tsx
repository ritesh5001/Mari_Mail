"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark } from "lucide-react";
import type { ContactModel } from "@/lib/contact-data";
import { apiFetch } from "@/lib/browser-fetch";

function fullName(c: ContactModel) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "(no name)";
}

function formatEnum(value: string | null | undefined) {
  return value ? value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()) : "-";
}

export function SavedContactsView({ contacts: initial }: { contacts: ContactModel[] }) {
  const [contacts, setContacts] = useState<ContactModel[]>(initial);

  async function unsave(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    try {
      await apiFetch(`/api/saved/${id}`, { method: "DELETE" });
    } catch {
      // best-effort; a refresh restores accurate state
    }
  }

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white py-16 text-center dark:border-white/10 dark:bg-white/[0.02]">
        <Bookmark className="mb-4 h-10 w-10 text-slate-300 dark:text-white/20" />
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">No saved contacts yet</h3>
        <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-white/50">
          Tap the bookmark on any contact in People to keep it here.
        </p>
        <Link href="/dashboard/contacts" className="mt-5 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-ocean dark:bg-accent-600 dark:hover:bg-accent-500">
          Browse contacts
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      <div className="max-h-[calc(100vh-260px)] overflow-auto overscroll-x-contain">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-white/10">
          <thead className="sticky top-0 z-30 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_rgb(226,232,240)] dark:bg-white/[0.04] dark:text-white/45 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.08)]">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Company</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {contacts.map((c) => (
              <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                  <Link href={`/dashboard/contacts/${c.id}`} className="hover:text-ocean">
                    {fullName(c)}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-white/60">{c.title ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-white/60">{c.companyName ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-white/60">{c.email}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-white/60">{c.country ?? "-"}</td>
                <td className="px-4 py-3 text-slate-600 dark:text-white/60">{formatEnum(c.marineRole)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => unsave(c.id)}
                    title="Remove from saved"
                    aria-label="Remove from saved"
                    className="rounded p-1 text-ocean hover:bg-slate-100 dark:hover:bg-white/10"
                  >
                    <Bookmark className="h-4 w-4 fill-ocean" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

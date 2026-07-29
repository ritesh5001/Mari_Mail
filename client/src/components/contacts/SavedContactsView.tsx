"use client";

import Link from "next/link";
import { Bookmark } from "lucide-react";
import type { ContactModel } from "@/lib/contact-data";
import { useClientSort } from "@/hooks/useClientSort";
import { SortableHeader } from "@/components/table/SortableHeader";

function fullName(c: ContactModel) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email || "(no name)";
}

function formatEnum(value: string | null | undefined) {
  return value ? value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()) : "-";
}

export function SavedContactsView({ contacts }: { contacts: ContactModel[] }) {
  const { sorted, sort, toggle } = useClientSort(contacts, {
    name: (c) => fullName(c),
    title: (c) => c.title,
    company: (c) => c.companyName,
    email: (c) => c.email,
    country: (c) => c.country,
    role: (c) => c.marineRole,
  });

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-white py-16 text-center dark:border-white/10 dark:bg-white/[0.02]">
        <Bookmark className="mb-4 h-10 w-10 text-slate-300 dark:text-white/20" />
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">No revealed contacts yet</h3>
        <p className="mt-1 max-w-xs text-sm text-slate-500 dark:text-white/50">
          Reveal a contact&rsquo;s email from any list or search and it shows up here.
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
              <SortableHeader label="Name" sortKey="name" sort={sort} onSort={toggle} />
              <SortableHeader label="Title" sortKey="title" sort={sort} onSort={toggle} />
              <SortableHeader label="Company" sortKey="company" sort={sort} onSort={toggle} />
              <SortableHeader label="Email" sortKey="email" sort={sort} onSort={toggle} />
              <SortableHeader label="Country" sortKey="country" sort={sort} onSort={toggle} />
              <SortableHeader label="Role" sortKey="role" sort={sort} onSort={toggle} />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-white/5">
            {sorted.map((c) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

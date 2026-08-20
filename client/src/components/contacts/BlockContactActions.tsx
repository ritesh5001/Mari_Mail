"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, Building2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

/**
 * Block this person, or their whole company, from the contact page.
 *
 * The natural moment to block someone is while you are looking at them, which
 * until now meant going back to the search screen — the only place the action
 * existed. Blocking navigates away because the page you are on is about to
 * stop showing this contact at all.
 */
export function BlockContactActions({
  contactId,
  email,
  name,
  companyName,
  website,
}: {
  contactId: string;
  email: string;
  name: string;
  companyName: string | null;
  website: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"CONTACT" | "COMPANY" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function block(kind: "CONTACT" | "COMPANY") {
    const subject = kind === "CONTACT" ? name || email : (companyName ?? "this company");
    if (!window.confirm(`Block ${subject}? They are removed from every list and no campaign will contact them.`)) {
      return;
    }
    setBusy(kind);
    setError(null);
    try {
      const res = await apiFetch(`/api/blocklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          kind === "CONTACT"
            ? { kind: "CONTACT", email, label: name || email, contactId }
            : {
                kind: "COMPANY",
                companyName: companyName ?? undefined,
                website: website ?? undefined,
                email,
                label: companyName ?? undefined,
              },
        ),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Could not block that.");
        return;
      }
      // This contact is now hidden everywhere, including the page we are on.
      router.push("/dashboard/settings/blocked");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void block("CONTACT")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
        >
          {busy === "CONTACT" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
          Block person
        </button>
        {companyName ? (
          <button
            type="button"
            onClick={() => void block("COMPANY")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-rose-300 hover:text-rose-600 disabled:opacity-50"
          >
            {busy === "COMPANY" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            Block company
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}

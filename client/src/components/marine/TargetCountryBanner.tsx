"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Globe, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

type CountryOption = { country: string; countryName: string };

/**
 * Inline banner shown on the Vessels and Port Radar pages when the
 * workspace hasn't picked a target port country yet. Lets workspace
 * owners/admins pick one without going to a separate Settings page.
 */
export function TargetCountryBanner() {
  const router = useRouter();
  const [options, setOptions] = useState<CountryOption[]>([]);
  const [selected, setSelected] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/workspaces/port-countries`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { data?: CountryOption[] } | null) => {
        if (!cancelled) setOptions(payload?.data ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!selected) return;
    setPending(true);
    setError(null);
    const response = await apiFetch(`/workspaces/me/target-country`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetPortCountry: selected }),
    });
    setPending(false);
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(payload?.error?.message ?? "Could not save");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-800/40 dark:bg-amber-900/15">
      <div className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
        <Globe className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Pick your target port country</p>
          <p className="text-xs text-amber-700/90 dark:text-amber-200/80">
            Focus this workspace on the right ships. We&apos;ll filter the Vessels page and Port Radar to vessels arriving at ports in the country you choose.
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <select
          value={selected}
          onChange={(event) => setSelected(event.currentTarget.value)}
          disabled={pending || options.length === 0}
          className="rounded-md border border-amber-300 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-amber-700/60 dark:bg-white/[0.04] dark:text-white/85"
        >
          <option value="">{options.length === 0 ? "Loading…" : "Select country"}</option>
          {options.map((option) => (
            <option key={option.country} value={option.country}>
              {option.countryName} ({option.country})
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={save}
          disabled={pending || !selected}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save
        </button>
      </div>
      {error ? (
        <div className="flex w-full items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700 sm:w-auto">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      ) : null}
    </div>
  );
}

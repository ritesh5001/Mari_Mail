"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiUrl } from "@/lib/client-api";

const companyTypes = [
  ["MARINE_SERVICE_COMPANY", "Marine service company"],
  ["SHIP_AGENT", "Ship agent"],
  ["HOLD_CLEANING", "Hold cleaning"],
  ["HULL_CLEANING", "Hull cleaning"],
  ["BUNKER_TRADER", "Bunker trader"],
  ["CHANDLER", "Chandler"],
  ["OTHER", "Other"],
] as const;

export function OnboardingForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${apiUrl}/auth/onboarding`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceName: String(form.get("workspaceName") ?? ""),
        companyType: String(form.get("companyType") ?? ""),
        primaryService: String(form.get("primaryService") ?? ""),
        timezone: String(form.get("timezone") ?? "UTC"),
      }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? "Unable to finish onboarding");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <label className="block text-sm font-medium text-slate-700">
        Workspace name
        <input
          name="workspaceName"
          defaultValue={defaultName}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          required
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Company type
        <select name="companyType" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" defaultValue="MARINE_SERVICE_COMPANY">
          {companyTypes.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Primary service
        <input
          name="primaryService"
          placeholder="Hold cleaning, agency, hull cleaning"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          required
        />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Timezone
        <input name="timezone" defaultValue="UTC" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" required />
      </label>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button className="w-full rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-ocean">
        Finish onboarding
      </button>
    </form>
  );
}

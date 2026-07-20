"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/browser-fetch";

type Port = { portCode: string; portName: string; region: string };
type Vessel = { id: string; imoNumber: string; vesselName: string; vesselType: string };

type Match = {
  ruleType: "PORT" | "CARGO";
  ruleId: string;
  campaignId: string;
  campaignName: string;
  reason: string;
  defaultDaysBefore: number[];
};

type Trigger = { id: string; campaignId: string; stepFireTimes: unknown };

type CreateResult = { eta: { id: string }; matches: Match[]; triggers: Trigger[] };

const cargoOptions = [
  "COAL",
  "GRAIN",
  "IRON_ORE",
  "BAUXITE",
  "FERTILIZER",
  "STEEL",
  "TIMBER",
  "CRUDE_OIL",
  "FUEL_OIL",
  "CHEMICALS",
  "CEMENT",
  "SALT",
  "SUGAR",
] as const;

const confidenceOptions = ["CONFIRMED", "ESTIMATED", "TENTATIVE"] as const;
const voyageStatusOptions = ["AT_SEA", "AT_ANCHOR", "IN_PORT", "DRIFTING", "UNKNOWN"] as const;

export function AddEtaForm({ vessel, ports }: { vessel: Vessel; ports: Port[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateResult | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);

    const form = new FormData(event.currentTarget);
    const body = {
      vesselId: vessel.id,
      destinationPort: String(form.get("destinationPort")),
      eta: new Date(String(form.get("eta"))).toISOString(),
      etaConfidence: String(form.get("etaConfidence")),
      voyageStatus: String(form.get("voyageStatus")),
      previousPort: String(form.get("previousPort") || "") || null,
      previousCargo: String(form.get("previousCargo") || "") || null,
      nextCargo: String(form.get("nextCargo") || "") || null,
      currentLat: form.get("currentLat") ? Number(form.get("currentLat")) : null,
      currentLon: form.get("currentLon") ? Number(form.get("currentLon")) : null,
      speedOverGround: form.get("speedOverGround") ? Number(form.get("speedOverGround")) : null,
    };

    const response = await apiFetch(`/api/vessel-etas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setPending(false);
    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? "Failed to create ETA");
      return;
    }
    const payload = (await response.json()) as { data: CreateResult };
    setResult(payload.data);
  }

  return (
    <div className="space-y-5">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Add ETA</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">{vessel.vesselName}</h2>
        <p className="text-sm text-slate-600">IMO {vessel.imoNumber} · {vessel.vesselType.replace(/_/g, " ")}</p>
      </header>

      <form className="grid gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2" onSubmit={submit}>
        <Field label="Destination Port">
          <select name="destinationPort" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select port…</option>
            {ports.map((port) => (
              <option key={port.portCode} value={port.portCode}>{port.portName} ({port.portCode})</option>
            ))}
          </select>
        </Field>
        <Field label="ETA (UTC)">
          <input name="eta" type="datetime-local" required className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <Field label="ETA Confidence">
          <select name="etaConfidence" defaultValue="ESTIMATED" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            {confidenceOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Voyage Status">
          <select name="voyageStatus" defaultValue="AT_SEA" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            {voyageStatusOptions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
        <Field label="Previous Port (LOCODE)">
          <input name="previousPort" placeholder="e.g. AUPHI" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Previous Cargo">
            <select name="previousCargo" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">—</option>
              {cargoOptions.map((cargo) => <option key={cargo} value={cargo}>{cargo}</option>)}
            </select>
          </Field>
          <Field label="Next Cargo">
            <select name="nextCargo" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              <option value="">—</option>
              {cargoOptions.map((cargo) => <option key={cargo} value={cargo}>{cargo}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Current Lat (optional)">
          <input name="currentLat" type="number" step="0.0001" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <Field label="Current Lon (optional)">
          <input name="currentLon" type="number" step="0.0001" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <Field label="Speed over Ground (knots)">
          <input name="speedOverGround" type="number" step="0.1" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </Field>
        <div className="md:col-span-2 flex items-center justify-between">
          <Link href={`/dashboard/vessels/${vessel.imoNumber}`} className="text-sm text-slate-500 hover:text-ocean">← Cancel</Link>
          <button type="submit" disabled={pending} className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? "Saving…" : "Create ETA & match campaigns"}
          </button>
        </div>
        {error ? <p className="md:col-span-2 text-sm text-red-600">{error}</p> : null}
      </form>

      {result ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm">
          <h3 className="text-base font-semibold text-emerald-900">ETA saved</h3>
          <p className="mt-1 text-emerald-800">
            Matched {result.matches.length} campaign rule(s); created {result.triggers.length} trigger(s).
          </p>
          {result.matches.length > 0 ? (
            <ul className="mt-3 space-y-1 text-emerald-900">
              {result.matches.map((match) => (
                <li key={match.campaignId} className="rounded-md bg-white px-3 py-2 shadow-sm">
                  <span className="font-semibold">{match.campaignName}</span>
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700">{match.ruleType}</span>
                  <p className="text-xs text-emerald-700">{match.reason}</p>
                </li>
              ))}
            </ul>
          ) : null}
          <button
            onClick={() => router.push(`/dashboard/vessels/${vessel.imoNumber}`)}
            className="mt-4 rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
          >
            Back to vessel
          </button>
        </section>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

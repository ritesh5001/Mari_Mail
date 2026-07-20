"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Anchor, ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, Download, Users } from "lucide-react";
import { apiUrl } from "@/lib/client-api";
import { CONTACT_SCHEMA_HEADERS } from "@/lib/contact-schema";

const companyTypes = [
  ["MARINE_SERVICE_COMPANY", "Marine service company"],
  ["SHIP_AGENT", "Ship agent"],
  ["HOLD_CLEANING", "Hold cleaning"],
  ["HULL_CLEANING", "Hull cleaning"],
  ["BUNKER_TRADER", "Bunker trader"],
  ["CHANDLER", "Chandler"],
  ["OTHER", "Other"],
] as const;

const primaryServices = [
  "Hold cleaning",
  "Tank cleaning",
  "Hull cleaning",
  "Agency",
  "Bunker",
  "Chandler",
  "Other",
];

const STEPS = [
  { key: "workspace", label: "Workspace" },
  { key: "contacts", label: "Contacts" },
  { key: "campaign", label: "Campaign" },
];

const CONTACT_TEMPLATE = `${CONTACT_SCHEMA_HEADERS.join(",")}\nJames,Ward,Fleet Manager,Pacific Carriers Ltd.,james.ward@example.com,Operations;Technical,Ritesh,+65 6000 0100,+65 9000 0101,+65 6000 0102,+65 6000 0103,https://linkedin.com/in/james,https://pacific.example.com,https://linkedin.com/company/pacific,SG,Parent Shipping Ltd.,james.secondary@example.com,SF-PC-001\n`;

export function OnboardingWizard({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspaceData, setWorkspaceData] = useState({
    workspaceName: defaultName,
    companyType: "MARINE_SERVICE_COMPANY",
    primaryService: "Hold cleaning",
    timezone: typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC",
    targetPortCountry: "",
  });
  const [countries, setCountries] = useState<Array<{ country: string; countryName: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiUrl}/workspaces/port-countries`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { data?: Array<{ country: string; countryName: string }> } | null) => {
        if (!cancelled) setCountries(payload?.data ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveWorkspace() {
    setError(null);
    setPending(true);
    const response = await fetch(`${apiUrl}/auth/onboarding`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workspaceData),
    });
    setPending(false);
    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? "Unable to save workspace");
      return false;
    }
    return true;
  }

  async function finish() {
    setPending(true);
    try {
      const confetti = (await import("canvas-confetti")).default;
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
    } catch {
      // ignore
    }
    router.push("/dashboard");
    router.refresh();
  }

  function downloadTemplate(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
        {STEPS.map((stage, idx) => (
          <div key={stage.key} className={`flex items-center gap-2 ${idx === step ? "text-ocean" : idx < step ? "text-emerald-600" : "text-slate-400"}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${idx <= step ? "border-ocean bg-ocean/10" : "border-slate-300"}`}>{idx + 1}</span>
            <span>{stage.label}</span>
            {idx < STEPS.length - 1 ? <ChevronRight className="h-3 w-3" /> : null}
          </div>
        ))}
      </div>

      {step === 0 ? (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-950">Workspace basics</h2>
          <p className="text-sm text-slate-600">These details power campaign defaults and timezone-sensitive ETA views.</p>
          <Field label="Workspace name">
            <input value={workspaceData.workspaceName} onChange={(e) => setWorkspaceData((d) => ({ ...d, workspaceName: e.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Company type">
            <select value={workspaceData.companyType} onChange={(e) => setWorkspaceData((d) => ({ ...d, companyType: e.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {companyTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="Primary service">
            <select value={workspaceData.primaryService} onChange={(e) => setWorkspaceData((d) => ({ ...d, primaryService: e.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
              {primaryServices.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Timezone">
            <input value={workspaceData.timezone} onChange={(e) => setWorkspaceData((d) => ({ ...d, timezone: e.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Target port country">
            <select
              value={workspaceData.targetPortCountry}
              onChange={(e) => setWorkspaceData((d) => ({ ...d, targetPortCountry: e.target.value }))}
              required
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                {countries.length === 0 ? "Loading…" : "Select a country"}
              </option>
              {countries.map((option) => (
                <option key={option.country} value={option.country}>
                  {option.countryName} ({option.country})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Your workspace will only show vessels arriving at ports in this country.
            </p>
          </Field>
        </section>
      ) : null}

      {step === 1 ? (
        <SkipStep
          title="Import contacts"
          icon={Users}
          description="MariMail contacts include all blueprint fields — first/last name, email, all phone numbers, LinkedIn, Salesforce ID, marine role, seniority."
        >
          <button onClick={() => downloadTemplate(CONTACT_TEMPLATE, "marimail-contacts-template.csv")} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> Download CSV template
          </button>
        </SkipStep>
      ) : null}

      {step === 2 ? (
        <SkipStep
          title="Create your first campaign"
          icon={Anchor}
          description={`We've pre-loaded an ETA-triggered campaign for "${workspaceData.primaryService}". Customise it from the Campaigns page or start from scratch.`}
        >
          <a href="/dashboard/campaigns" className="text-xs font-semibold text-ocean hover:underline">Open Campaigns →</a>
        </SkipStep>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || pending}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            disabled={pending || (step === 0 && !workspaceData.targetPortCountry)}
            onClick={async () => {
              if (step === 0) {
                const ok = await saveWorkspace();
                if (!ok) return;
              }
              setStep((s) => Math.min(STEPS.length - 1, s + 1));
            }}
            className="inline-flex items-center gap-1 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Continue"} <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={finish}
            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" /> Finish onboarding
          </button>
        )}
      </div>
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

function SkipStep({ title, icon: Icon, description, children }: { title: string; icon: typeof Anchor; description: string; children?: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-ocean/10 p-2 text-ocean"><Icon className="h-5 w-5" /></div>
        <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      </div>
      <p className="text-sm text-slate-600">{description}</p>
      <div>{children}</div>
      <p className="text-xs text-slate-400">Skip for now — you can do this anytime from the dashboard.</p>
    </section>
  );
}

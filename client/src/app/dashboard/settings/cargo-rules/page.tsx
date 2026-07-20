import Link from "next/link";
import { listCampaignsForWorkspace, listCargoRules, requireEtaWorkspaceId } from "@/lib/eta-data";
import { CargoRuleManager } from "@/components/marine/CargoRuleManager";

export const dynamic = "force-dynamic";

export default async function CargoRulesPage() {
  const { workspaceId } = await requireEtaWorkspaceId();
  const [rules, campaigns] = await Promise.all([
    listCargoRules(workspaceId),
    listCampaignsForWorkspace(workspaceId),
  ]);
  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Settings</p>
        <h2 className="text-2xl font-semibold text-slate-950">Cargo Change Trigger Rules</h2>
        <p className="mt-1 text-sm text-slate-600">
          Fire a campaign when a vessel&apos;s previous cargo and next cargo combination matches. Leave previous cargo empty to
          match any → next cargo (e.g. ANY → GRAIN).
        </p>
        <p className="mt-1 text-xs text-slate-400">
          <Link className="text-ocean hover:underline" href="/dashboard/settings/port-rules">Port campaign rules →</Link>
        </p>
      </header>
      <CargoRuleManager
        rules={rules.map((rule) => ({
          id: rule.id,
          previousCargo: rule.previousCargo,
          nextCargo: rule.nextCargo,
          vesselTypes: rule.vesselTypes.map((type) => String(type)),
          campaignName: rule.campaign.name,
          autoEnroll: rule.autoEnroll,
          workspaceScoped: rule.workspaceId !== null,
        }))}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}

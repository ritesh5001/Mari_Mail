import { listCampaignsForWorkspace, listCargoRules, requireEtaWorkspaceId } from "@/lib/eta-data";
import { CargoRuleManager } from "@/components/marine/CargoRuleManager";
import { SettingsCard } from "@/components/settings/SettingsCard";

export const dynamic = "force-dynamic";

export default async function CargoRulesPage() {
  const { workspaceId } = await requireEtaWorkspaceId();
  const [rules, campaigns] = await Promise.all([
    listCargoRules(workspaceId),
    listCampaignsForWorkspace(workspaceId),
  ]);
  return (
    <SettingsCard
      title="Cargo change rules"
      description="Fire a campaign when a vessel's previous and next cargo match a combination you care about — a tanker switching trade is a buying signal."
    >
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
    </SettingsCard>
  );
}

import { SettingsCard } from "@/components/settings/SettingsCard";
import { listCampaignsForWorkspace, listPortRules, requireEtaWorkspaceId } from "@/lib/eta-data";
import { PortRuleManager } from "@/components/marine/PortRuleManager";

export const dynamic = "force-dynamic";

/**
 * `listPorts()` used to be awaited here and handed to the form.
 *
 * It is an unfiltered, unprojected `findMany` over the port registry — 10,928
 * rows with every column — serialised into the page payload so a `<select>`
 * could render 10,928 `<option>` elements. The picker now loads ports from
 * `/workspaces/ports`, which is country-scoped, projected to four columns and
 * cached server-side, so this page no longer pays for that query at all.
 */
export default async function PortRulesPage() {
  const { workspaceId } = await requireEtaWorkspaceId();
  const [rules, campaigns] = await Promise.all([
    listPortRules(workspaceId),
    listCampaignsForWorkspace(workspaceId),
  ]);

  return (
    <SettingsCard
      title="Port campaign rules"
      description="Enrol a vessel in a campaign automatically when it is due at a port you care about. Rules are checked in priority order, and the first match wins."
    >
      <PortRuleManager
        rules={rules.map((rule) => ({
          id: rule.id,
          portCode: rule.portCode,
          portName: rule.port?.portName ?? rule.portCode,
          vesselTypes: rule.vesselTypes.map((type) => String(type)),
          campaignId: rule.campaignId,
          campaignName: rule.campaign.name,
          autoEnroll: rule.autoEnroll,
          priority: rule.priority,
          workspaceScoped: rule.workspaceId !== null,
        }))}
        campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
      />
    </SettingsCard>
  );
}

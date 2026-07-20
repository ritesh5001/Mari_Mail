import { prisma, type VesselType } from "@marimail/db";

export type CampaignMatch = {
  ruleType: "PORT" | "CARGO" | "VESSEL_LIST";
  ruleId: string;
  campaignId: string;
  campaignName: string;
  reason: string;
  defaultDaysBefore: number[];
  autoEnroll: boolean;
  priority: number;
};

const ANY_CARGO_TOKEN = "ANY";

function normaliseCargo(input: string | null | undefined) {
  if (!input) return null;
  return input.trim().toUpperCase().replaceAll(" ", "_").replaceAll("-", "_");
}

export async function matchCampaignsToETA(vesselEtaId: string): Promise<CampaignMatch[]> {
  const eta = await prisma.vesselETA.findUnique({
    where: { id: vesselEtaId },
    include: {
      vessel: { select: { vesselType: true, vesselName: true, imoNumber: true } },
      port: { select: { portName: true } },
    },
  });
  if (!eta) return [];

  // Global ETAs (workspaceId=null) match every workspace's port rules so an
  // admin-authored ETA can enroll all workspaces' matching campaigns.
  // Workspace-scoped ETAs still only match their own workspace's rules plus
  // any explicitly-global rules.
  const portRules = await prisma.portCampaignRule.findMany({
    where: {
      portCode: eta.destinationPort,
      ...(eta.workspaceId
        ? { OR: [{ workspaceId: eta.workspaceId }, { workspaceId: null }] }
        : {}),
    },
    include: { campaign: { select: { id: true, name: true, defaultDaysBefore: true } } },
    orderBy: { priority: "asc" },
  });

  const matches: CampaignMatch[] = [];
  for (const rule of portRules) {
    const vesselTypeMatches =
      rule.vesselTypes.length === 0 || rule.vesselTypes.includes(eta.vessel.vesselType as VesselType);
    if (!vesselTypeMatches) continue;
    matches.push({
      ruleType: "PORT",
      ruleId: rule.id,
      campaignId: rule.campaignId,
      campaignName: rule.campaign.name,
      reason:
        rule.vesselTypes.length === 0
          ? `Port match: ${eta.port?.portName ?? eta.destinationPort} (any vessel type)`
          : `Port + Vessel Type match: ${eta.port?.portName ?? eta.destinationPort} ${eta.vessel.vesselType}`,
      defaultDaysBefore: rule.campaign.defaultDaysBefore,
      autoEnroll: rule.autoEnroll,
      priority: rule.priority,
    });
  }

  const prev = normaliseCargo(eta.previousCargo);
  const next = normaliseCargo(eta.nextCargo);
  if (next) {
    const cargoRules = await prisma.cargoChangeTrigger.findMany({
      // Same global-ETA semantics as port rules: match everyone's cargo
      // triggers when the ETA itself is global.
      where: eta.workspaceId
        ? { OR: [{ workspaceId: eta.workspaceId }, { workspaceId: null }] }
        : {},
      include: { campaign: { select: { id: true, name: true, defaultDaysBefore: true } } },
    });

    for (const rule of cargoRules) {
      const nextMatches =
        rule.nextCargo.length === 0 ||
        rule.nextCargo.map(normaliseCargo).filter(Boolean).includes(next) ||
        rule.nextCargo.includes(ANY_CARGO_TOKEN);
      if (!nextMatches) continue;

      const prevList = rule.previousCargo.map(normaliseCargo).filter(Boolean);
      const prevMatches =
        prevList.length === 0 ||
        rule.previousCargo.includes(ANY_CARGO_TOKEN) ||
        (prev !== null && prevList.includes(prev));
      if (!prevMatches) continue;

      const vesselTypeMatches =
        rule.vesselTypes.length === 0 || rule.vesselTypes.includes(eta.vessel.vesselType as VesselType);
      if (!vesselTypeMatches) continue;

      matches.push({
        ruleType: "CARGO",
        ruleId: rule.id,
        campaignId: rule.campaignId,
        campaignName: rule.campaign.name,
        reason: `Cargo change: ${prev ?? "ANY"} → ${next}`,
        defaultDaysBefore: rule.campaign.defaultDaysBefore,
        autoEnroll: rule.autoEnroll,
        priority: 50,
      });
    }
  }

  // Vessel-in-list matching — the primary flow for ETA campaigns now.
  // If the user picked vessels from the ETA Radar, added them to a list, and
  // pointed a campaign at that list, any ETA on any of those vessels fires
  // the campaign — no port rule required. Port rules stay as an optional
  // advanced feature (e.g. "also fire for anyone else's vessel landing at
  // this port"); they take priority when they match.
  const vesselListCampaigns = await prisma.campaign.findMany({
    where: {
      status: "ACTIVE",
      triggerType: { in: ["ETA_BASED", "PORT_BASED"] },
      // Workspace-scoped ETA → match only that workspace's campaigns.
      // Global ETA (workspaceId=null) → match every workspace's campaigns so
      // admin-authored ETAs propagate the same way port rules do.
      ...(eta.workspaceId ? { workspaceId: eta.workspaceId } : {}),
    },
    select: {
      id: true,
      name: true,
      defaultDaysBefore: true,
      targetConfig: true,
    },
  });

  for (const campaign of vesselListCampaigns) {
    const cfg = campaign.targetConfig as { contactListIds?: unknown } | null;
    const listIds = Array.isArray(cfg?.contactListIds)
      ? (cfg?.contactListIds as unknown[]).filter((id): id is string => typeof id === "string")
      : [];
    if (!listIds.length) continue;

    const membership = await prisma.listVessel.findFirst({
      where: { vesselId: eta.vesselId, listId: { in: listIds } },
      select: { listId: true },
    });
    if (!membership) continue;

    matches.push({
      ruleType: "VESSEL_LIST",
      ruleId: `list:${membership.listId}`,
      campaignId: campaign.id,
      campaignName: campaign.name,
      reason: `Vessel ${eta.vessel.vesselName} is in this campaign's target list — ETA to ${eta.port?.portName ?? eta.destinationPort}`,
      defaultDaysBefore: campaign.defaultDaysBefore,
      autoEnroll: true,
      // Higher than port (rule.priority) and cargo (50) so an explicit port
      // rule wins the dedup below, and vessel-in-list acts as the fallback.
      priority: 150,
    });
  }

  const uniqueByCampaign = new Map<string, CampaignMatch>();
  for (const match of matches) {
    if (!uniqueByCampaign.has(match.campaignId)) uniqueByCampaign.set(match.campaignId, match);
  }
  return Array.from(uniqueByCampaign.values()).sort((a, b) => a.priority - b.priority);
}

export type StepFireTime = { stepOrder: number; delayValue: number; fireAt: string };

export function computeStepFireTimes(eta: Date, delayValues: number[]): StepFireTime[] {
  const baseMs = eta.getTime();
  return delayValues
    .map((delay, index) => ({
      stepOrder: index + 1,
      delayValue: delay,
      fireAt: new Date(baseMs - delay * 86_400_000).toISOString(),
    }))
    .sort((a, b) => new Date(a.fireAt).getTime() - new Date(b.fireAt).getTime());
}

export async function createETATriggers(vesselEtaId: string, campaignIds: string[]) {
  const eta = await prisma.vesselETA.findUnique({
    where: { id: vesselEtaId },
    select: { id: true, vesselId: true, destinationPort: true, eta: true, workspaceId: true },
  });
  if (!eta) return [];

  // When the ETA is global (workspaceId=null), match campaigns across every
  // workspace. Otherwise stay scoped to the ETA's own workspace.
  const campaigns = await prisma.campaign.findMany({
    where: eta.workspaceId
      ? { id: { in: campaignIds }, workspaceId: eta.workspaceId }
      : { id: { in: campaignIds } },
    select: { id: true, defaultDaysBefore: true, name: true, workspaceId: true },
  });

  const created = [];
  for (const campaign of campaigns) {
    const steps = computeStepFireTimes(eta.eta, campaign.defaultDaysBefore);
    const nextFire = steps.find((step) => new Date(step.fireAt).getTime() > Date.now());
    // ETATrigger needs a real workspaceId — use the campaign's when the ETA
    // is global, otherwise use the ETA's.
    const triggerWorkspaceId = eta.workspaceId ?? campaign.workspaceId;
    const trigger = await prisma.eTATrigger.upsert({
      where: { campaignId_vesselEtaId: { campaignId: campaign.id, vesselEtaId: eta.id } },
      update: {
        triggerDaysBefore: campaign.defaultDaysBefore,
        stepFireTimes: steps,
        nextFireAt: nextFire ? new Date(nextFire.fireAt) : null,
        status: "PENDING",
      },
      create: {
        workspaceId: triggerWorkspaceId,
        campaignId: campaign.id,
        vesselId: eta.vesselId,
        vesselEtaId: eta.id,
        portCode: eta.destinationPort,
        triggerDaysBefore: campaign.defaultDaysBefore,
        stepFireTimes: steps,
        nextFireAt: nextFire ? new Date(nextFire.fireAt) : null,
        status: "PENDING",
      },
    });
    created.push(trigger);
  }

  if (created.length > 0) {
    await prisma.vesselETA.update({
      where: { id: eta.id },
      data: { campaignsTriggered: true, triggeredAt: new Date() },
    });
  }

  return created;
}

export async function recomputeETATriggerTimes(vesselEtaId: string) {
  const eta = await prisma.vesselETA.findUnique({
    where: { id: vesselEtaId },
    select: { id: true, eta: true },
  });
  if (!eta) return;

  const triggers = await prisma.eTATrigger.findMany({
    where: { vesselEtaId: eta.id, status: { in: ["PENDING", "ACTIVE"] } },
  });
  for (const trigger of triggers) {
    const steps = computeStepFireTimes(eta.eta, trigger.triggerDaysBefore);
    const nextFire = steps.find((step) => new Date(step.fireAt).getTime() > Date.now());
    await prisma.eTATrigger.update({
      where: { id: trigger.id },
      data: {
        stepFireTimes: steps,
        nextFireAt: nextFire ? new Date(nextFire.fireAt) : null,
      },
    });
  }
}

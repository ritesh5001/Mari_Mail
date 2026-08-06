/**
 * One-time backfill for the "Apollo contact stuck at PENDING, never
 * scheduled" bug.
 *
 * Root cause: contacts added to a list from an Apollo vessel-domain search
 * lost their vessel attribution at persist time (the server re-derived it
 * from the contact's domain, which fails for domains Apollo bridged from a
 * related org). With no vesselId the ETA scheduler can't fire against them,
 * so they sit at PENDING forever.
 *
 * The forward-fix (forwarding the search's matchedVesselIds) stops NEW
 * contacts from breaking. The reconciler's self-heal (healStrandedEtaContacts)
 * repairs EXISTING contacts on the next list change. This script triggers
 * that self-heal proactively for every list an active non-MANUAL campaign
 * targets, so already-broken contacts get attributed and scheduled without
 * waiting for a manual list edit.
 *
 * Safe to run repeatedly: the reconciler only touches stranded rows
 * (vesselId = null, status PENDING/SCHEDULED) and only attributes contacts
 * that genuinely resolve to a vessel. Contacts still unattributable are left
 * untouched.
 *
 * Run with:  pnpm --filter @marimail/server exec tsx src/scripts/backfill-vessel-attribution.ts
 */
import { prisma } from "@marimail/db";
import { reconcileCampaignsForList } from "../services/campaign-list-reconciler.js";


function listIdsFromTargetConfig(targetConfig: unknown): string[] {
  if (!targetConfig || typeof targetConfig !== "object" || Array.isArray(targetConfig)) return [];
  const raw = (targetConfig as Record<string, unknown>).contactListIds;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string");
}

async function main() {
  console.log("[backfill] starting vessel-attribution repair…");

  // Every active campaign that isn't purely manual — those are the ones whose
  // contacts need a vessel link to schedule.
  const campaigns = await prisma.campaign.findMany({
    where: { status: "ACTIVE", triggerType: { not: "MANUAL" } },
    select: { id: true, name: true, targetConfig: true },
  });

  // Collect the distinct set of target lists across all of them.
  const listIds = new Set<string>();
  for (const campaign of campaigns) {
    for (const id of listIdsFromTargetConfig(campaign.targetConfig)) listIds.add(id);
  }

  if (listIds.size === 0) {
    console.log("[backfill] no active ETA campaigns target any list — nothing to do.");
    return;
  }

  console.log(
    `[backfill] ${campaigns.length} active ETA campaign(s) across ${listIds.size} list(s). ` +
      `Running the reconciler self-heal on each…`,
  );

  // Count stranded rows before, for a before/after report.
  const strandedBefore = await prisma.campaignContact.count({
    where: { vesselId: null, status: { in: ["PENDING", "SCHEDULED"] } },
  });

  let processed = 0;
  for (const listId of listIds) {
    try {
      // reconcileCampaignsForList runs healStrandedEtaContacts internally:
      // attributes stranded contacts + schedules their vessels' upcoming ETAs.
      await reconcileCampaignsForList(listId);
      processed += 1;
      console.log(`[backfill] reconciled list ${listId} (${processed}/${listIds.size})`);
    } catch (err) {
      console.warn(`[backfill] list ${listId} failed: ${(err as Error).message}`);
    }
  }

  const strandedAfter = await prisma.campaignContact.count({
    where: { vesselId: null, status: { in: ["PENDING", "SCHEDULED"] } },
  });

  console.log(
    `[backfill] done. Stranded (no vessel, PENDING/SCHEDULED) rows: ${strandedBefore} → ${strandedAfter} ` +
      `(${strandedBefore - strandedAfter} attributed & scheduled).`,
  );
  if (strandedAfter > 0) {
    console.log(
      `[backfill] ${strandedAfter} row(s) still have no vessel link. Their persisted domain/company ` +
        `doesn't textually match any vessel on the list, and the search's original attribution was never ` +
        `stored (that's the bug this release fixes going forward). To recover them: re-run the Apollo ` +
        `search for that list and click "Add to list" again — the re-add now persists the vessel pin, and ` +
        `the reconciler will schedule them. Contacts that shouldn't be in the campaign can just be removed.`,
    );
  }
}

main()
  .catch((err) => {
    console.error("[backfill] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

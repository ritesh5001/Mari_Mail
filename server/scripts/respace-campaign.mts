/**
 * Re-space a manual campaign's pending sends onto the fixed random gap.
 *
 *   tsx scripts/respace-campaign.mts <campaignId>            # preview only
 *   tsx scripts/respace-campaign.mts <campaignId> --apply    # actually reschedule
 *
 * The `nextSendSlot` hour-rounding bug baked a flat 60-minute spacing into
 * every campaign scheduled before the fix. Fixing the code only helps NEW
 * enrolments — rows already carrying an hourly `nextSendAt` keep it, and a
 * plain relaunch chains off those stale times instead of replacing them.
 *
 * This drops the queued jobs, clears the pending `nextSendAt`s, and re-enrols
 * so the corrected scheduler lays them out again. Contacts that have already
 * sent (or replied, or been staged) are never touched.
 */
import { prisma } from "@marimail/db";
import {
  cancelManualJobsForCampaign,
  launchManualCampaign,
  nextSendSlot,
} from "../src/services/campaign-manual-scheduler.js";

const campaignId = process.argv[2];
const apply = process.argv.includes("--apply");
if (!campaignId) {
  console.error("usage: tsx scripts/respace-campaign.mts <campaignId> [--apply]");
  process.exit(1);
}

const hhmm = (d: Date) => d.toISOString().replace("T", " ").slice(0, 16) + "Z";

const campaign = await prisma.campaign.findUnique({
  where: { id: campaignId },
  include: { sequences: { orderBy: { stepOrder: "asc" } } },
});
if (!campaign) {
  console.error(`no campaign ${campaignId}`);
  process.exit(1);
}
if (campaign.triggerType !== "MANUAL") {
  console.error(`campaign ${campaignId} is ${campaign.triggerType}, not MANUAL — nothing to respace`);
  process.exit(1);
}

const gapMin = campaign.sendGapSeconds;
const gapMax = Math.max(campaign.sendGapMaxSeconds, gapMin);
console.log(`campaign : ${campaign.name} (${campaign.status})`);
console.log(`gap      : ${gapMin / 60}-${gapMax / 60} min`);
console.log(`window   : ${campaign.scheduleHourStart}:00-${campaign.scheduleHourEnd}:00 ${campaign.timezone}\n`);

// Only rows that have not gone out yet. SENT/REPLIED/FAILED history stays put.
const pending = await prisma.campaignContact.findMany({
  where: { campaignId, status: "SCHEDULED", nextSendAt: { not: null } },
  select: { id: true, nextSendAt: true },
  orderBy: { nextSendAt: "asc" },
});
if (pending.length === 0) {
  console.log("no pending sends to respace.");
  process.exit(0);
}

const currentGaps = pending
  .slice(1)
  .map((r, i) => (r.nextSendAt!.getTime() - pending[i].nextSendAt!.getTime()) / 60000);
console.log(`current  : ${pending.length} pending, gaps ${[...new Set(currentGaps)].join("/")} min`);
console.log(`           ${pending.slice(0, 5).map((r) => hhmm(r.nextSendAt!)).join("  ")}\n`);

// Preview what the corrected scheduler will produce, using the same chaining.
const windowOpts = {
  scheduleDays: campaign.scheduleDays,
  hourStart: campaign.scheduleHourStart,
  hourEnd: campaign.scheduleHourEnd,
  timeZone: campaign.timezone,
};
const preview: Date[] = [];
let latest: Date | null = null;
for (let i = 0; i < pending.length; i += 1) {
  const gap = gapMax > gapMin ? gapMin + Math.floor(Math.random() * (gapMax - gapMin + 1)) : gapMin;
  const base = latest ? Math.max(Date.now(), latest.getTime() + gap * 1000) : Date.now();
  const fire = nextSendSlot(new Date(base), windowOpts);
  preview.push(fire);
  latest = fire;
}
const newGaps = preview.slice(1).map((d, i) => Math.round((d.getTime() - preview[i].getTime()) / 60000));
console.log(`after    : gaps ${newGaps.slice(0, 8).join(", ")}... min`);
console.log(`           ${preview.slice(0, 5).map(hhmm).join("  ")}\n`);

if (!apply) {
  console.log("preview only — re-run with --apply to reschedule.");
  process.exit(0);
}

const removed = await cancelManualJobsForCampaign(campaignId);
console.log(`removed ${removed} queued job(s)`);

const cleared = await prisma.campaignContact.updateMany({
  where: { id: { in: pending.map((r) => r.id) } },
  data: { nextSendAt: null },
});
console.log(`cleared ${cleared.count} stale nextSendAt`);

const result = await launchManualCampaign(campaignId, { skipStaged: true });
console.log(`re-enrolled ${result.contacts} contact(s), ${result.scheduled} step(s) scheduled`);

const after = await prisma.campaignContact.findMany({
  where: { campaignId, status: "SCHEDULED", nextSendAt: { not: null } },
  select: { nextSendAt: true },
  orderBy: { nextSendAt: "asc" },
  take: 6,
});
console.log(`\nnow scheduled: ${after.map((r) => hhmm(r.nextSendAt!)).join("  ")}`);
await prisma.$disconnect();
process.exit(0);

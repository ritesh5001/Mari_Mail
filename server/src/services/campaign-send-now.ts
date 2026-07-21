import { prisma, type Contact } from "@marimail/db";
import { resolveCampaignContacts } from "./campaign-targets.js";
import {
  findSuppression,
  sendSequenceStep,
  type EtaSendContext,
} from "./sequence-sender.js";

/**
 * For an ETA-driven campaign fired via Send Now, resolve the ETA context so
 * merge tags ({{vessel_name}}, {{eta_port}}, {{eta_date}}, …) render with
 * real values instead of the "there" empty-fallback. Manual/cold campaigns
 * return null (no vessel context — those templates shouldn't use ETA tags).
 *
 * Resolution order:
 *   1. The vessel recorded on the CampaignContact row (set when the contact
 *      was enrolled via an ETA trigger), then its nearest upcoming ETA.
 *   2. If no vessel on the row, no ETA context (null).
 */
async function resolveEtaContext(
  campaign: { id: string; triggerType: string; workspaceId: string },
  contactId: string,
): Promise<EtaSendContext | null> {
  if (campaign.triggerType !== "ETA_BASED" && campaign.triggerType !== "PORT_BASED") {
    return null;
  }

  const campaignContact = await prisma.campaignContact.findUnique({
    where: { campaignId_contactId: { campaignId: campaign.id, contactId } },
    select: { vesselId: true },
  });
  if (!campaignContact?.vesselId) return null;

  // Nearest upcoming ETA for this vessel, with the vessel + port detail the
  // personalization builder needs.
  const eta = await prisma.vesselETA.findFirst({
    where: { vesselId: campaignContact.vesselId, eta: { gte: new Date() } },
    orderBy: { eta: "asc" },
    include: {
      port: { select: { region: true } },
      vessel: {
        select: {
          vesselName: true,
          imoNumber: true,
          vesselType: true,
          dwt: true,
          flag: true,
          shipOwnerCompany: { select: { companyName: true } },
        },
      },
    },
  });
  if (!eta) return null;

  return {
    eta: eta.eta,
    destinationPortName: eta.destinationPortName,
    previousCargo: eta.previousCargo,
    nextCargo: eta.nextCargo,
    port: eta.port ? { region: eta.port.region ?? "" } : null,
    vessel: {
      vesselName: eta.vessel.vesselName,
      imoNumber: eta.vessel.imoNumber,
      vesselType: eta.vessel.vesselType,
      dwt: eta.vessel.dwt,
      flag: eta.vessel.flag,
      shipOwnerCompany: eta.vessel.shipOwnerCompany
        ? { companyName: eta.vessel.shipOwnerCompany.companyName }
        : null,
    },
  };
}

const TERMINAL_STATUSES = new Set([
  "SENT",
  "OPENED",
  "CLICKED",
  "REPLIED",
  "BOUNCED",
  "UNSUBSCRIBED",
  "FAILED",
]);

export type SendNowResult = {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  errors: Array<{ contactId: string; email: string; reason: string }>;
  skippedDetails: Array<{ contactId: string; email: string; reason: string }>;
};

/**
 * Fires Step 1 of a campaign synchronously to every pending contact —
 * useful for "send now" UI affordances and for diagnosing the campaign send
 * pipeline without waiting for BullMQ + the schedule window. Bypasses
 * BullMQ entirely; subsequent steps still go through the normal scheduler
 * if the campaign was launched.
 *
 * When `contactIds` is provided, only those contacts are considered (the
 * "Send now" picker uses this to fire to a hand-selected subset).
 */
export async function sendCampaignNow(
  campaignId: string,
  contactIds?: string[],
): Promise<SendNowResult> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { sequences: { orderBy: { stepOrder: "asc" } } },
  });
  if (!campaign) throw new Error("Campaign not found");
  const sequence = campaign.sequences[0];
  if (!sequence) {
    return { total: 0, sent: 0, failed: 0, skipped: 0, errors: [], skippedDetails: [] };
  }

  let targets = await resolveCampaignContacts({
    workspaceId: campaign.workspaceId,
    targetConfig: campaign.targetConfig,
  });

  if (contactIds && contactIds.length > 0) {
    const allowed = new Set(contactIds);
    // Allow ad-hoc picks that aren't in the campaign's resolved targets yet
    // (e.g. an admin firing a one-off to themselves) by also loading them
    // directly. The lookup accepts both workspace-owned contacts AND global
    // (workspaceId=null) contacts that are members of one of the campaign's
    // target lists — mirroring resolveCampaignContacts so a CSV-imported
    // "global" contact picked in the Send Now modal actually sends.
    const known = new Set(targets.map((c) => c.id));
    const missing = contactIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
      const targetConfig = campaign.targetConfig as { contactListIds?: unknown } | null;
      const listIds = Array.isArray(targetConfig?.contactListIds)
        ? (targetConfig!.contactListIds as unknown[]).filter((id): id is string => typeof id === "string")
        : [];
      const extra = await prisma.contact.findMany({
        where: {
          id: { in: missing },
          OR: [
            { workspaceId: campaign.workspaceId },
            listIds.length
              ? { workspaceId: null, listMemberships: { some: { listId: { in: listIds } } } }
              : { id: "__NEVER_MATCH__" },
          ],
        },
      });
      targets = [...targets, ...extra];
    }
    targets = targets.filter((c) => allowed.has(c.id));
  }

  const result: SendNowResult = {
    total: targets.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    skippedDetails: [],
  };

  for (const contact of targets) {
    const sendResult = await sendOneNow(campaign, sequence, contact);
    if (sendResult.outcome === "sent") result.sent += 1;
    else if (sendResult.outcome === "skipped") {
      result.skipped += 1;
      result.skippedDetails.push({
        contactId: contact.id,
        email: contact.email,
        reason: sendResult.reason,
      });
    } else {
      result.failed += 1;
      result.errors.push({
        contactId: contact.id,
        email: contact.email,
        reason: sendResult.reason,
      });
    }
  }

  return result;
}

type OneResult =
  | { outcome: "sent" }
  | { outcome: "skipped"; reason: string }
  | { outcome: "failed"; reason: string };

async function sendOneNow(
  campaign: NonNullable<Awaited<ReturnType<typeof prisma.campaign.findUnique>>>,
  sequence: { id: string; stepOrder: number; conditionType: string; subject: string; bodyHtml: string; bodyText: string | null; abTestEnabled: boolean; abSubjectB: string | null; abBodyHtmlB: string | null; abSplit: number },
  contact: Contact,
): Promise<OneResult> {
  const existing = await prisma.campaignContact.findUnique({
    where: { campaignId_contactId: { campaignId: campaign.id, contactId: contact.id } },
  });
  // STAGED is not a terminal status, so the check below would let these
  // through. They are candidates awaiting review, not campaign members.
  if (existing?.status === "STAGED") {
    return {
      outcome: "skipped",
      reason: "Staged for review — confirm them in the campaign's Leads tab first.",
    };
  }
  if (existing && TERMINAL_STATUSES.has(existing.status)) {
    return {
      outcome: "skipped",
      reason: `Already in terminal status ${existing.status}; reset the contact to retry.`,
    };
  }

  const suppression = await findSuppression(campaign.workspaceId, contact.email);
  if (suppression) {
    await prisma.campaignContact.upsert({
      where: { campaignId_contactId: { campaignId: campaign.id, contactId: contact.id } },
      update: { status: "UNSUBSCRIBED", nextSendAt: null },
      create: {
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
        contactId: contact.id,
        status: "UNSUBSCRIBED",
      },
    });
    const reasonType = (suppression as { reason?: string }).reason ?? "unsubscribed";
    return {
      outcome: "skipped",
      reason: `Address is on the workspace suppression list (${reasonType}).`,
    };
  }

  const campaignContact = await prisma.campaignContact.upsert({
    where: { campaignId_contactId: { campaignId: campaign.id, contactId: contact.id } },
    update: { sequenceId: sequence.id, currentStep: sequence.stepOrder },
    create: {
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      contactId: contact.id,
      sequenceId: sequence.id,
      currentStep: sequence.stepOrder,
      status: "SCHEDULED",
    },
  });

  try {
    // Resolve ETA context so merge tags render real values on ETA campaigns
    // (Send Now previously always passed null, making every {{vessel_name}} /
    // {{eta_port}} render as the "there" empty-fallback).
    const eta = await resolveEtaContext(campaign, contact.id);
    const result = await sendSequenceStep({
      campaign,
      // sendSequenceStep expects the full Prisma CampaignSequence type; we
      // already loaded it via the campaign include above.
      sequence: sequence as Parameters<typeof sendSequenceStep>[0]["sequence"],
      contact,
      campaignContactId: campaignContact.id,
      eta,
      scheduledFor: new Date().toISOString(),
    });
    if ("sent" in result && result.sent) return { outcome: "sent" };
    if ("deferred" in result && result.deferred) {
      // The inbox is within its per-inbox send-gap cooldown. Send Now is a
      // manual, immediate action, so rather than silently failing we surface it
      // as skipped with a clear reason; the contact stays enrollable and the
      // scheduled path will still fire it once the gap elapses.
      const seconds = Math.ceil(result.retryAfterMs / 1000);
      return {
        outcome: "skipped",
        reason: `Sending inbox is cooling down (per-inbox send gap); retry in ~${seconds}s.`,
      };
    }
    if ("bounced" in result && result.bounced) {
      return { outcome: "failed", reason: "Recipient bounced (hard)." };
    }
    if ("failed" in result && result.failed) {
      return {
        outcome: "failed",
        reason: ("reason" in result ? result.reason : null) ?? "Send failed",
      };
    }
    return { outcome: "failed", reason: "Unknown send outcome" };
  } catch (error) {
    return {
      outcome: "failed",
      reason: error instanceof Error ? error.message : "Unknown send error",
    };
  }
}

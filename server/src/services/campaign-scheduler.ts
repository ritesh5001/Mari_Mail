import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { prisma, type CampaignSequence } from "@marimail/db";
import { matchContactToVessel } from "@marimail/utils";
import { resolveCampaignContacts, stagedContactIds } from "./campaign-targets.js";

type StepFireTime = {
  stepOrder: number;
  delayValue: number;
  fireAt: string;
};

export type EtaStepJob = {
  etaTriggerId: string;
  sequenceStepId: string;
  contactId: string;
  scheduledFor: string;
};

const redisUrl = process.env.REDIS_URL;
const connection = redisUrl
  ? new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true })
  : null;
if (connection) {
  connection.on("error", (err) => {
    console.warn(`[campaign-scheduler] Redis error: ${(err as Error).message}`);
  });
}
const etaStepQueue = connection ? new Queue<EtaStepJob>("eta-step", { connection }) : null;

function parseStepFireTimes(value: unknown): StepFireTime[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StepFireTime => {
    if (!item || typeof item !== "object") return false;
    const entry = item as Record<string, unknown>;
    return typeof entry.stepOrder === "number" && typeof entry.delayValue === "number" && typeof entry.fireAt === "string";
  });
}

function sequenceFireAt(sequence: CampaignSequence, fireTimes: StepFireTime[]): Date | null {
  const exact = fireTimes.find((time) => time.stepOrder === sequence.stepOrder);
  if (exact) return new Date(exact.fireAt);
  // No computed fire time for this step (added after the trigger was created,
  // or a defaultDaysBefore mismatch). Returning "now" here caused immediate
  // sends — treat it as unschedulable instead.
  return null;
}

async function ensureConnection() {
  if (!connection) return false;
  if (connection.status === "wait" || connection.status === "end") {
    try {
      await connection.connect();
    } catch (err) {
      console.warn(`[campaign-scheduler] Redis connect failed: ${(err as Error).message}`);
      return false;
    }
  }
  return true;
}

export async function cancelEtaTriggerJobs(etaTriggerId: string) {
  if (!etaStepQueue || !(await ensureConnection())) return;
  const jobs = await etaStepQueue.getJobs(["delayed", "waiting", "paused", "prioritized"]);
  await Promise.all(
    jobs
      .filter((job) => String(job.id).startsWith(`${etaTriggerId}:`))
      .map((job) => job.remove().catch(() => undefined)),
  );
}

export async function scheduleEtaTrigger(etaTriggerId: string) {
  if (!etaStepQueue || !(await ensureConnection())) {
    return { scheduled: 0, contacts: 0, skipped: "redis-unavailable" as const };
  }
  const trigger = await prisma.eTATrigger.findUnique({
    where: { id: etaTriggerId },
    include: {
      campaign: { include: { sequences: { orderBy: { stepOrder: "asc" } } } },
      vesselEta: {
        include: {
          // Full company rows (email/website, not just name) — the
          // vessel-association filter below matches contacts by email domain
          // and company website, so it needs the complete signal set.
          vessel: {
            include: {
              shipOwnerCompany: true,
              ismManagerCompany: true,
              commercialManagerCompany: true,
            },
          },
        },
      },
    },
  });
  if (!trigger || trigger.status === "CANCELLED" || trigger.campaign.status !== "ACTIVE") {
    return { scheduled: 0, contacts: 0 };
  }

  const resolved = await resolveCampaignContacts({
    workspaceId: trigger.workspaceId,
    targetConfig: trigger.campaign.targetConfig,
    eta: trigger.vesselEta,
  });

  // An ETA fires for ONE vessel — only send to the contacts associated with
  // that vessel (same email-domain / company matching the list UI shows).
  // A contact associated with two vessels in the list receives sends for
  // each vessel's ETA, each personalised with that vessel's port and date.
  // Contacts in the list with no signal linking them to this vessel are
  // skipped — they'll fire when their own vessel gets an ETA.
  // Union: live matcher OR the explicit matchedVesselIds pinned onto Apollo
  // contacts when they were added from the list's vessel-domain search
  // (Apollo bridges related domains — citi.com ↔ citibank.com — that the
  // matcher can't reconnect from the persisted contact alone).
  const vessel = trigger.vesselEta.vessel;
  const pinnedToVessel = (contact: { customFields?: unknown }): boolean => {
    const fields = contact.customFields;
    if (!fields || typeof fields !== "object") return false;
    const ids = (fields as Record<string, unknown>).matchedVesselIds;
    return Array.isArray(ids) && ids.includes(vessel.id);
  };
  const contacts = resolved.filter(
    (contact) => matchContactToVessel(contact, vessel) !== null || pinnedToVessel(contact),
  );
  if (resolved.length > 0 && contacts.length === 0) {
    console.warn(
      `[campaign-scheduler] eta-trigger ${trigger.id}: ${resolved.length} target contact(s) resolved but none associate with vessel ${vessel.vesselName} (${vessel.imoNumber}) — nothing scheduled for this ETA.`,
    );
  }
  const fireTimes = parseStepFireTimes(trigger.stepFireTimes);
  let scheduled = 0;
  let skippedPast = 0;

  // Steps whose "N days before ETA" moment already passed must NOT all blast
  // out at once when the trigger is created close to the ETA (the "5 mails in
  // one minute" bug). Rule: strictly-future steps fire at their scheduled
  // time; of the past-due steps only the most recent one is sent now, and
  // only if it's less than CATCH_UP_GRACE_MS stale — older steps are skipped
  // because their pre-arrival window is simply over.
  const CATCH_UP_GRACE_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const timedSteps = trigger.campaign.sequences
    .map((sequence) => ({ sequence, fireAt: sequenceFireAt(sequence, fireTimes) }))
    .filter((step): step is { sequence: CampaignSequence; fireAt: Date } => step.fireAt !== null);
  const latestPastDue = timedSteps
    .filter((step) => step.fireAt.getTime() <= now)
    .sort((a, b) => b.fireAt.getTime() - a.fireAt.getTime())[0];
  const catchUpStepId =
    latestPastDue && now - latestPastDue.fireAt.getTime() <= CATCH_UP_GRACE_MS
      ? latestPastDue.sequence.id
      : null;
  const sendableSteps = timedSteps.filter(
    (step) => step.fireAt.getTime() > now || step.sequence.id === catchUpStepId,
  );

  if (sendableSteps.length === 0) {
    console.warn(
      `[campaign-scheduler] eta-trigger ${trigger.id}: every sequence step's fire time is already past (ETA too close or elapsed) — nothing scheduled.`,
    );
    await prisma.eTATrigger.update({ where: { id: trigger.id }, data: { status: "ACTIVE" } });
    return { scheduled: 0, contacts: contacts.length };
  }

  // Contacts staged for review are candidates, not members. This function
  // re-resolves targets from targetConfig on every fire, so without this filter
  // the upsert below would flip a STAGED row straight to SCHEDULED and email
  // someone the user never confirmed.
  const staged = await stagedContactIds(
    trigger.campaignId,
    contacts.map((contact) => contact.id),
  );
  const sendable = contacts.filter((contact) => !staged.has(contact.id));
  if (staged.size > 0) {
    console.log(
      `[campaign-scheduler] eta-trigger ${trigger.id}: held ${staged.size} staged contact(s) awaiting review — not scheduled.`,
    );
  }

  for (const contact of sendable) {
    const campaignContact = await prisma.campaignContact.upsert({
      where: { campaignId_contactId: { campaignId: trigger.campaignId, contactId: contact.id } },
      update: {
        etaTriggerId: trigger.id,
        vesselId: trigger.vesselId,
        status: "SCHEDULED",
      },
      create: {
        workspaceId: trigger.workspaceId,
        campaignId: trigger.campaignId,
        contactId: contact.id,
        vesselId: trigger.vesselId,
        etaTriggerId: trigger.id,
        status: "SCHEDULED",
      },
    });

    for (const { sequence, fireAt } of sendableSteps) {
      const delay = Math.max(0, fireAt.getTime() - Date.now());
      await etaStepQueue.add(
        "send-eta-step",
        {
          etaTriggerId: trigger.id,
          sequenceStepId: sequence.id,
          contactId: contact.id,
          scheduledFor: fireAt.toISOString(),
        },
        {
          delay,
          jobId: `${trigger.id}:${sequence.id}:${contact.id}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 5 * 60 * 1000 },
          removeOnComplete: 500,
          removeOnFail: 500,
        },
      );
      scheduled += 1;
    }
    skippedPast += timedSteps.length - sendableSteps.length;

    const next = sendableSteps
      .filter((item) => item.fireAt.getTime() >= Date.now())
      .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())[0];

    await prisma.campaignContact.update({
      where: { id: campaignContact.id },
      data: {
        sequenceId: next?.sequence.id,
        nextSendAt: next?.fireAt,
      },
    });
  }

  if (skippedPast > 0) {
    console.log(
      `[campaign-scheduler] eta-trigger ${trigger.id}: skipped ${skippedPast} past-due step job(s) — their days-before-ETA window had already passed at scheduling time.`,
    );
  }

  await prisma.eTATrigger.update({
    where: { id: trigger.id },
    data: { status: "ACTIVE" },
  });

  return { scheduled, contacts: sendable.length, staged: staged.size };
}

export async function rescheduleEtaTrigger(etaTriggerId: string) {
  await cancelEtaTriggerJobs(etaTriggerId);
  return scheduleEtaTrigger(etaTriggerId);
}

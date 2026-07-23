import { prisma } from "@marimail/db";
import { DelayedError, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import type { ManualStepJob } from "../services/campaign-manual-scheduler.js";
import { findSuppression, sendSequenceStep, shouldSkip } from "../services/sequence-sender.js";
import { deferJob, workerOptionsFor } from "./shared-worker-options.js";

async function processManualStep(job: Job<ManualStepJob>, token?: string) {
  const [campaign, sequence, contact] = await Promise.all([
    prisma.campaign.findUnique({ where: { id: job.data.campaignId } }),
    prisma.campaignSequence.findUnique({ where: { id: job.data.sequenceStepId } }),
    prisma.contact.findUnique({ where: { id: job.data.contactId } }),
  ]);

  if (!campaign || !sequence || !contact || campaign.status !== "ACTIVE") {
    return { skipped: true, reason: "missing-or-inactive" };
  }

  const suppression = await findSuppression(campaign.workspaceId, contact.email);
  if (suppression) {
    await prisma.campaignContact.updateMany({
      where: { campaignId: campaign.id, contactId: contact.id },
      data: { status: "UNSUBSCRIBED", nextSendAt: null },
    });
    return { skipped: true, reason: "suppressed" };
  }

  // Last line of defence before a send: a job may have been queued before the
  // contact was staged. The upsert below doesn't touch status, so without this
  // a STAGED candidate would be emailed. No row at all is fine — that means
  // this contact was never staged.
  const enrolment = await prisma.campaignContact.findUnique({
    where: { campaignId_contactId: { campaignId: campaign.id, contactId: contact.id } },
    select: { status: true },
  });
  if (enrolment?.status === "STAGED") {
    return { skipped: true, reason: "staged-awaiting-review" };
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

  if (
    await shouldSkip({
      campaignContactId: campaignContact.id,
      campaignId: campaign.id,
      contactId: contact.id,
      conditionType: sequence.conditionType,
    })
  ) {
    return { skipped: true, reason: "condition" };
  }

  try {
    // Same as the ETA worker: on retry, reuse the slot the first attempt
    // already claimed so we don't consume a fresh gap position each defer.
    const reservedSlotAt =
      typeof (job.data as { reservedSlotAt?: number }).reservedSlotAt === "number"
        ? (job.data as { reservedSlotAt: number }).reservedSlotAt
        : null;
    const result = await sendSequenceStep({
      campaign,
      sequence,
      contact,
      campaignContactId: campaignContact.id,
      eta: null,
      scheduledFor: job.data.scheduledFor,
      reservedSlotAt,
    });
    // The chosen inbox is still cooling down (per-inbox send gap). Re-delay this
    // job in place instead of sending now or failing, so the contact stays
    // SCHEDULED and fires once the gap has elapsed.
    if ("deferred" in result && result.deferred) {
      const delayed = await deferJob(job, token, result.retryAfterMs, {
        reservedSlotAt: result.reservedSlotAt,
      });
      if (delayed) throw delayed;
      return { deferred: true, giveUp: true };
    }
    return result;
  } catch (error) {
    // A DelayedError is the deferral signal (inbox cooling down), not a
    // failure — rethrow it untouched so BullMQ re-schedules the job and the
    // contact stays SCHEDULED.
    if (error instanceof DelayedError) throw error;
    // sendSequenceStep already marks fatal errors as FAILED on the contact
    // and only rethrows transient ones. Once BullMQ has exhausted retries,
    // mark the contact FAILED so the UI stops showing a stale Scheduled time.
    const attempts = job.opts.attempts ?? 1;
    const isFinalAttempt = (job.attemptsMade ?? 0) + 1 >= attempts;
    if (isFinalAttempt) {
      await prisma.campaignContact.updateMany({
        where: { campaignId: campaign.id, contactId: contact.id },
        data: {
          status: "FAILED",
          nextSendAt: null,
          lastEventAt: new Date(),
        },
      });
    }
    throw error;
  }
}

export function startManualSchedulerWorker(connection: Redis) {
  return new Worker<ManualStepJob>("manual-step", processManualStep, workerOptionsFor(connection));
}

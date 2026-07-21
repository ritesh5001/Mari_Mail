import { prisma } from "@marimail/db";
import { DelayedError, Worker, type Job } from "bullmq";
import type { Redis } from "ioredis";
import { findSuppression, sendSequenceStep, shouldSkip } from "../services/sequence-sender.js";
import { deferJob, workerOptionsFor } from "./shared-worker-options.js";

type EtaStepJob = {
  etaTriggerId: string;
  sequenceStepId: string;
  contactId: string;
  scheduledFor: string;
};

async function processEtaStep(job: Job<EtaStepJob>, token?: string) {
  const [trigger, sequence, contact] = await Promise.all([
    prisma.eTATrigger.findUnique({
      where: { id: job.data.etaTriggerId },
      include: {
        campaign: true,
        vesselEta: {
          include: {
            port: true,
            vessel: { include: { shipOwnerCompany: true, ismManagerCompany: true, commercialManagerCompany: true } },
          },
        },
      },
    }),
    prisma.campaignSequence.findUnique({ where: { id: job.data.sequenceStepId } }),
    prisma.contact.findUnique({ where: { id: job.data.contactId } }),
  ]);

  if (!trigger || !sequence || !contact || trigger.campaign.status !== "ACTIVE") {
    return { skipped: true, reason: "missing-or-inactive" };
  }

  const suppression = await findSuppression(trigger.workspaceId, contact.email);
  if (suppression) {
    await prisma.campaignContact.updateMany({
      where: { campaignId: trigger.campaignId, contactId: contact.id },
      data: { status: "UNSUBSCRIBED", nextSendAt: null },
    });
    return { skipped: true, reason: "suppressed" };
  }

  // Last line of defence before a send: a job may have been queued before the
  // contact was staged. The upsert below doesn't touch status, so without this
  // a STAGED candidate would be emailed. No row at all is fine — that means
  // this contact was never staged.
  const enrolment = await prisma.campaignContact.findUnique({
    where: { campaignId_contactId: { campaignId: trigger.campaignId, contactId: contact.id } },
    select: { status: true },
  });
  if (enrolment?.status === "STAGED") {
    return { skipped: true, reason: "staged-awaiting-review" };
  }

  const campaignContact = await prisma.campaignContact.upsert({
    where: { campaignId_contactId: { campaignId: trigger.campaignId, contactId: contact.id } },
    update: { sequenceId: sequence.id, currentStep: sequence.stepOrder },
    create: {
      workspaceId: trigger.workspaceId,
      campaignId: trigger.campaignId,
      contactId: contact.id,
      vesselId: trigger.vesselId,
      etaTriggerId: trigger.id,
      sequenceId: sequence.id,
      currentStep: sequence.stepOrder,
      status: "SCHEDULED",
    },
  });

  if (
    await shouldSkip({
      campaignContactId: campaignContact.id,
      campaignId: trigger.campaignId,
      contactId: contact.id,
      conditionType: sequence.conditionType,
    })
  ) {
    return { skipped: true, reason: "condition" };
  }

  try {
    const result = await sendSequenceStep({
      campaign: trigger.campaign,
      sequence,
      contact,
      campaignContactId: campaignContact.id,
      eta: trigger.vesselEta,
      scheduledFor: job.data.scheduledFor,
    });
    // Chosen inbox is cooling down (per-inbox send gap): re-delay in place so
    // the contact stays SCHEDULED and fires once the gap has elapsed.
    if ("deferred" in result && result.deferred) {
      const delayed = await deferJob(job, token, result.retryAfterMs);
      if (delayed) throw delayed;
      return { deferred: true, giveUp: true };
    }
    return result;
  } catch (error) {
    // A DelayedError is the deferral signal (inbox cooling down), not a
    // failure — rethrow untouched so BullMQ re-schedules the job.
    if (error instanceof DelayedError) throw error;
    const attempts = job.opts.attempts ?? 1;
    const isFinalAttempt = (job.attemptsMade ?? 0) + 1 >= attempts;
    if (isFinalAttempt) {
      await prisma.campaignContact.updateMany({
        where: { campaignId: trigger.campaignId, contactId: contact.id },
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

export function startCampaignSchedulerWorker(connection: Redis) {
  return new Worker<EtaStepJob>("eta-step", processEtaStep, workerOptionsFor(connection));
}

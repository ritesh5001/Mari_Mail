import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@marimail/db";
import { resolveCampaignContacts, stagedContactIds } from "./campaign-targets.js";

export type ManualStepJob = {
  campaignId: string;
  sequenceStepId: string;
  contactId: string;
  scheduledFor: string;
  /** Stamped by deferJob when the inbox is cooling down; carries the claimed
   *  send slot across retries so we don't advance the gap counter each time. */
  reservedSlotAt?: number;
  /** Same idea for the campaign-level gap. */
  reservedCampaignSlotAt?: number;
};

const redisUrl = process.env.REDIS_URL;
const connection = redisUrl
  ? new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true })
  : null;
if (connection) {
  connection.on("error", (err) => {
    console.warn(`[manual-scheduler] Redis error: ${(err as Error).message}`);
  });
}
const manualStepQueue = connection ? new Queue<ManualStepJob>("manual-step", { connection }) : null;

async function ensureConnection() {
  if (!connection) return false;
  if (connection.status === "wait" || connection.status === "end") {
    try {
      await connection.connect();
    } catch (err) {
      console.warn(`[manual-scheduler] Redis connect failed: ${(err as Error).message}`);
      return false;
    }
  }
  return true;
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function tzHourAndDay(date: Date, timeZone: string): { hour: number; day: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, weekday: "short", hour: "2-digit" }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
    const day = WEEKDAY_INDEX[parts.find((p) => p.type === "weekday")?.value ?? "Sun"] ?? 0;
    return { hour, day };
  } catch {
    // Unknown timezone — treat as UTC.
    return { hour: date.getUTCHours(), day: date.getUTCDay() };
  }
}

/**
 * Returns the next instant at/after `from` that falls inside the campaign's
 * sending window (allowed weekday + [hourStart, hourEnd) in the campaign
 * timezone). Rolls forward hour-by-hour (bounded to ~21 days).
 */
export function nextSendSlot(
  from: Date,
  opts: { scheduleDays: number[]; hourStart: number; hourEnd: number; timeZone: string },
): Date {
  const { scheduleDays, hourStart, hourEnd, timeZone } = opts;
  if (scheduleDays.length === 0 || hourEnd <= hourStart) return from;
  let cursor = new Date(Math.ceil(from.getTime() / 3_600_000) * 3_600_000);
  for (let i = 0; i < 24 * 21; i += 1) {
    const { hour, day } = tzHourAndDay(cursor, timeZone);
    if (scheduleDays.includes(day) && hour >= hourStart && hour < hourEnd) return cursor;
    cursor = new Date(cursor.getTime() + 3_600_000);
  }
  return cursor;
}

type ManualCampaign = Awaited<ReturnType<typeof prisma.campaign.findUnique>> & {
  sequences: Awaited<ReturnType<typeof prisma.campaignSequence.findMany>>;
};

/**
 * Enrol a single new contact into an already-running manual campaign and
 * schedule every sequence step on the campaign's send window. Used by the
 * initial launch and by the list-membership reconciler when a vessel/contact
 * added later brings in a newly-matching person.
 */
export async function enrolAndScheduleManualContact(
  campaign: NonNullable<ManualCampaign>,
  contactId: string,
): Promise<number> {
  if (!manualStepQueue || !(await ensureConnection())) return 0;

  const now = Date.now();
  const windowOpts = {
    scheduleDays: campaign.scheduleDays,
    hourStart: campaign.scheduleHourStart,
    hourEnd: campaign.scheduleHourEnd,
    timeZone: campaign.timezone,
  };

  // Enforce the per-campaign send gap: shift Step 1 to sit at least
  // `gap` seconds after the latest already-scheduled Step-1 send for this
  // campaign. When sendGapMaxSeconds > sendGapSeconds the gap is a fresh
  // random value in [min, max] for human-like pacing. Later steps inherit
  // this offset via their own cumulative delay.
  //
  // Bug fix: the previous version filtered `nextSendAt: { gt: new Date() }`,
  // which broke bulk launches. The launch loop enrols contacts one at a
  // time; by the time we query for the just-enrolled peer's nextSendAt, it
  // is milliseconds "in the past" relative to a fresh Date.now(), so the
  // `gt` filter dropped it and every contact fell back to `step1Base = now`.
  // Result: every mail went out at the same instant regardless of gap. We
  // now look at the max `nextSendAt` across all campaignContacts (past or
  // future) and clamp with Math.max(now, latest + gap).
  let step1Base = now;
  const gapMin = campaign.sendGapSeconds;
  const gapMax = Math.max(campaign.sendGapMaxSeconds, gapMin);
  if (gapMax > 0 && campaign.sequences.length > 0) {
    const gapSeconds =
      gapMax > gapMin ? gapMin + Math.floor(Math.random() * (gapMax - gapMin + 1)) : gapMin;
    const step1 = campaign.sequences[0];
    const latest = await prisma.campaignContact.findFirst({
      where: {
        campaignId: campaign.id,
        sequenceId: step1.id,
        nextSendAt: { not: null },
      },
      orderBy: { nextSendAt: "desc" },
      select: { nextSendAt: true },
    });
    if (latest?.nextSendAt) {
      step1Base = Math.max(step1Base, latest.nextSendAt.getTime() + gapSeconds * 1000);
    }
  }

  let cumulativeDays = 0;
  const stepFireAt = new Map<string, Date>();
  for (const sequence of campaign.sequences) {
    cumulativeDays += sequence.delayValue;
    const candidate = new Date(step1Base + cumulativeDays * 86_400_000);
    stepFireAt.set(sequence.id, nextSendSlot(candidate, windowOpts));
  }

  const campaignContact = await prisma.campaignContact.upsert({
    where: { campaignId_contactId: { campaignId: campaign.id, contactId } },
    update: { status: "SCHEDULED" },
    create: {
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      contactId,
      status: "SCHEDULED",
    },
  });

  let scheduled = 0;
  for (const sequence of campaign.sequences) {
    const fireAt = stepFireAt.get(sequence.id)!;
    const delay = Math.max(0, fireAt.getTime() - Date.now());
    try {
      await manualStepQueue.add(
        "send-manual-step",
        {
          campaignId: campaign.id,
          sequenceStepId: sequence.id,
          contactId,
          scheduledFor: fireAt.toISOString(),
        },
        {
          delay,
          jobId: `manual-${campaign.id}-${sequence.id}-${contactId}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 5 * 60 * 1000 },
          removeOnComplete: 500,
          removeOnFail: 500,
        },
      );
      scheduled += 1;
    } catch (err) {
      // Bubble a classified error out so /launch can return a user-actionable
      // 503 (e.g. Upstash monthly quota exhaustion). Without this the raw
      // Redis reply reaches the client as a generic 500.
      throw classifyRedisError(err);
    }
  }

  const next = campaign.sequences
    .map((sequence) => ({ sequence, fireAt: stepFireAt.get(sequence.id)! }))
    .filter((item) => item.fireAt.getTime() >= Date.now())
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())[0];

  await prisma.campaignContact.update({
    where: { id: campaignContact.id },
    data: { sequenceId: next?.sequence.id, nextSendAt: next?.fireAt },
  });

  return scheduled;
}

/**
 * Removes any manual-step jobs still queued for a campaign — called before we
 * delete the Campaign row so the worker doesn't wake up 30 minutes later and
 * try to send from a CampaignContact that no longer exists. Job IDs follow
 * the shape `manual-<campaignId>-<sequenceStepId>-<contactId>` (see the add
 * call above), so the prefix scan is precise.
 */
export async function cancelManualJobsForCampaign(campaignId: string): Promise<number> {
  if (!manualStepQueue || !(await ensureConnection())) return 0;
  const prefix = `manual-${campaignId}-`;
  let removed = 0;
  // BullMQ's getJobs accepts a state list + pagination. We drain both delayed
  // and waiting/active buckets since a campaign can have jobs in any of them.
  const jobs = await manualStepQueue.getJobs(["delayed", "waiting", "active", "paused", "prioritized"], 0, 500);
  for (const job of jobs) {
    if (typeof job.id === "string" && job.id.startsWith(prefix)) {
      await job.remove().catch(() => undefined);
      removed += 1;
    }
  }
  return removed;
}

/**
 * Move a single already-queued step to a new fire time. Used by the campaign
 * detail's per-row "Reschedule" action so an overdue SCHEDULED row (send time
 * in the past because the campaign sat idle) can be pushed to a future time
 * without cancel/re-enrol. Idempotent: if no queued job exists it still
 * updates `nextSendAt` and adds a fresh job.
 */
export async function rescheduleManualStep(input: {
  campaignId: string;
  sequenceStepId: string;
  contactId: string;
  fireAt: Date;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!manualStepQueue || !(await ensureConnection())) {
    return { ok: false, reason: "Queue backend unavailable" };
  }
  const jobId = `manual-${input.campaignId}-${input.sequenceStepId}-${input.contactId}`;
  // Remove any prior job for this (campaign, step, contact) so we don't end
  // up with two firing at different times. `Job.remove` no-ops when the id
  // isn't queued, which is the case for ETA-based sends or already-fired steps.
  try {
    const existing = await manualStepQueue.getJob(jobId);
    if (existing) await existing.remove().catch(() => undefined);
  } catch {
    // Non-fatal — proceed to add the fresh job.
  }
  const delay = Math.max(0, input.fireAt.getTime() - Date.now());
  try {
    await manualStepQueue.add(
      "send-manual-step",
      {
        campaignId: input.campaignId,
        sequenceStepId: input.sequenceStepId,
        contactId: input.contactId,
        scheduledFor: input.fireAt.toISOString(),
      },
      {
        delay,
        jobId,
        attempts: 3,
        backoff: { type: "exponential", delay: 5 * 60 * 1000 },
        removeOnComplete: 500,
        removeOnFail: 500,
      },
    );
  } catch (err) {
    throw classifyRedisError(err);
  }
  await prisma.campaignContact.update({
    where: {
      campaignId_contactId: {
        campaignId: input.campaignId,
        contactId: input.contactId,
      },
    },
    data: {
      status: "SCHEDULED",
      sequenceId: input.sequenceStepId,
      nextSendAt: input.fireAt,
    },
  });
  return { ok: true };
}

/**
 * Thrown when the manual scheduler can't reach BullMQ / Redis at all. Wraps
 * both the initial connection failure and mid-flight quota errors so the
 * campaigns route can return a specific 503 with a user-actionable message
 * instead of a generic "Unexpected server error".
 */
export class ManualSchedulerUnavailableError extends Error {
  constructor(message: string, readonly kind: "redis-unavailable" | "redis-quota" | "redis-transient") {
    super(message);
    this.name = "ManualSchedulerUnavailableError";
  }
}

function classifyRedisError(err: unknown): ManualSchedulerUnavailableError {
  const msg = err instanceof Error ? err.message : String(err);
  if (/max requests limit exceeded/i.test(msg) || /quota/i.test(msg)) {
    return new ManualSchedulerUnavailableError(
      `Upstash Redis quota exhausted (${msg}). Upgrade the Redis plan or wait for the monthly reset; no scheduled sends can be queued until then.`,
      "redis-quota",
    );
  }
  return new ManualSchedulerUnavailableError(
    `Redis error while scheduling: ${msg}`,
    "redis-transient",
  );
}

/**
 * Enrols the campaign's targeted contacts and schedules every sequence step on
 * a fixed (non-ETA) timeline: step 1 at the next valid send slot, each
 * follow-up `delayValue` days after the previous one. Reuses the manual-step
 * worker which shares the ETA send core.
 */
/**
 * `skipStaged` must be true when re-launching a campaign that was already
 * ACTIVE. Launch resolves its targets fresh from targetConfig, so without this
 * a re-launch would enrol — and email — the very contacts the user has staged
 * for review but not yet confirmed. On a first launch (DRAFT/PAUSED → ACTIVE)
 * there are no staged rows by construction, so it's a no-op.
 */
export async function launchManualCampaign(campaignId: string, options?: { skipStaged?: boolean }) {
  if (!manualStepQueue || !(await ensureConnection())) {
    return { scheduled: 0, contacts: 0, skipped: "redis-unavailable" as const };
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { sequences: { orderBy: { stepOrder: "asc" } } },
  });
  if (!campaign || campaign.status !== "ACTIVE") {
    return { scheduled: 0, contacts: 0 };
  }

  const resolved = await resolveCampaignContacts({
    workspaceId: campaign.workspaceId,
    targetConfig: campaign.targetConfig,
  });
  if (resolved.length === 0) {
    return { scheduled: 0, contacts: 0 };
  }

  const staged = options?.skipStaged
    ? await stagedContactIds(campaign.id, resolved.map((contact) => contact.id))
    : new Set<string>();
  const contacts = resolved.filter((contact) => !staged.has(contact.id));
  if (staged.size > 0) {
    console.log(
      `[manual-scheduler] campaign=${campaign.id}: held ${staged.size} staged contact(s) awaiting review — not enrolled on relaunch.`,
    );
  }

  let scheduled = 0;
  for (const contact of contacts) {
    scheduled += await enrolAndScheduleManualContact(campaign, contact.id);
  }

  return { scheduled, contacts: contacts.length };
}
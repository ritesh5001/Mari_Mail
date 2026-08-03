import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { Prisma, prisma } from "@marimail/db";
import { resolveCampaignContacts, stagedContactIds } from "./campaign-targets.js";
import { dividedCampaignGap, campaignInboxes } from "./campaign-capacity.js";

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

  // Already inside the sending window: keep the exact time, minutes and all.
  //
  // Those minutes ARE the send gap. This used to round every candidate up to
  // the next whole hour before testing it, which silently destroyed the gap:
  // contact 1 landed at 09:00, contact 2's base (09:00 + a random 5-20 min)
  // rounded back up to 10:00, contact 3's to 11:00. A campaign configured for
  // a 5-20 min random gap scheduled all 20 mails at a flat 60-minute spacing.
  const at = tzHourAndDay(from, timeZone);
  if (scheduleDays.includes(at.day) && at.hour >= hourStart && at.hour < hourEnd) return from;

  // Outside it: walk hour by hour to the next open window and start at the top
  // of that hour. Nothing to preserve across the jump — the next contact chains
  // its gap off this new time and lands inside the window again.
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
  // Same division as the bulk layout: the configured gap is per-mailbox
  // pacing, so a fleet of N sends N times faster overall. A contact enrolled
  // one at a time (the list reconciler's path) must queue at the same rate the
  // bulk path uses, or drip arrivals would pace themselves as if there were a
  // single mailbox.
  const enrolInboxes = await campaignInboxes(campaign.workspaceId, campaign.fromAccountIds);
  const enrolPaced = dividedCampaignGap(
    campaign.sendGapSeconds,
    campaign.sendGapMaxSeconds,
    enrolInboxes.length,
  );
  let step1Base = now;
  const gapMin = enrolPaced.min;
  const gapMax = Math.max(enrolPaced.max, gapMin);
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
  const states = ["delayed", "waiting", "active", "paused", "prioritized"] as const;

  // Page through every job instead of reading only the first 500. A campaign
  // with 1,000 contacts and two steps has 2,000 jobs, so the single-page read
  // left most of them queued — and because `add` dedupes on jobId, those
  // survivors silently pinned the campaign to its old schedule after an edit.
  //
  // Collect first, delete after: removing mid-scan shifts the indices out from
  // under the next page and skips jobs.
  const PAGE = 500;
  const targets = [];
  for (let start = 0; ; start += PAGE) {
    const jobs = await manualStepQueue.getJobs([...states], start, start + PAGE - 1);
    if (jobs.length === 0) break;
    for (const job of jobs) {
      if (typeof job.id === "string" && job.id.startsWith(prefix)) targets.push(job);
    }
    if (jobs.length < PAGE) break;
  }

  // Remove in bounded batches rather than one await per job. This runs inside
  // an edit/relaunch request now, and 138 serial round-trips to Upstash took
  // over two minutes — long enough for the HTTP request to give up while the
  // campaign sat half-rescheduled. Bounded rather than unbounded because
  // Upstash bills per command and throttles bursts.
  const REMOVE_CONCURRENCY = 32;
  let removed = 0;
  for (let i = 0; i < targets.length; i += REMOVE_CONCURRENCY) {
    const batch = targets.slice(i, i + REMOVE_CONCURRENCY);
    const outcomes = await Promise.allSettled(batch.map((job) => job.remove()));
    removed += outcomes.filter((o) => o.status === "fulfilled").length;
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
/**
 * Fields whose change invalidates an already-laid-out schedule. Editing any of
 * these means the pending sends were computed against settings the campaign no
 * longer has.
 */
export const SCHEDULE_FIELDS = [
  "sendGapSeconds",
  "sendGapMaxSeconds",
  "scheduleDays",
  "scheduleHourStart",
  "scheduleHourEnd",
  "timezone",
] as const;

/**
 * True when an update actually changes something the current schedule was
 * computed from.
 *
 * Worth comparing rather than respacing on every save: a respace rewrites live
 * send times, so it must not fire because someone edited a subject line. A
 * field the caller omitted is "unchanged", not "cleared".
 */
export function scheduleFieldsChanged(
  before: Partial<Record<(typeof SCHEDULE_FIELDS)[number], unknown>>,
  next: Partial<Record<(typeof SCHEDULE_FIELDS)[number], unknown>>,
): boolean {
  return SCHEDULE_FIELDS.some((field) => {
    const after = next[field];
    if (after === undefined) return false;
    const prev = before[field];
    return Array.isArray(after) || Array.isArray(prev)
      ? JSON.stringify(after) !== JSON.stringify(prev)
      : after !== prev;
  });
}

/**
 * Lay a batch of contacts onto the campaign's sending window and queue them.
 *
 * The whole run is computed in memory and written with one addBulk pass.
 * Scheduling contact-by-contact through enrolAndScheduleManualContact is the
 * obvious reuse, but it re-queries the campaign's latest scheduled send on
 * every iteration and adds jobs one at a time: 69 contacts cost ~100s of
 * serial Neon + Upstash round-trips. That is far past an HTTP timeout for
 * something that runs inside the launch/edit request. Here the running
 * "latest" is just a local variable.
 *
 * `startAtMs` pins where the run begins — used by respace to hold the batch
 * at the time it was already due rather than dragging it to whenever the user
 * pressed save. `startAfterMs` chains this batch behind sends that already
 * exist, so
 * contacts added to a running campaign queue up at the end of the run rather
 * than jumping ahead of people who were already waiting.
 */
async function layoutAndQueue(
  campaign: NonNullable<ManualCampaign>,
  rows: { id: string; contactId: string }[],
  opts: { startAfterMs?: number | null; startAtMs?: number | null } = {},
): Promise<{ contacts: number; jobs: number }> {
  if (!manualStepQueue || rows.length === 0 || campaign.sequences.length === 0) {
    return { contacts: 0, jobs: 0 };
  }

  const windowOpts = {
    scheduleDays: campaign.scheduleDays,
    hourStart: campaign.scheduleHourStart,
    hourEnd: campaign.scheduleHourEnd,
    timeZone: campaign.timezone,
  };
  // Lay the run out at the rate the fleet can actually sustain. The configured
  // gap is per-mailbox pacing; spread across N mailboxes the campaign as a
  // whole emits N times faster, and rotation gives each mailbox back its own
  // full gap. Scheduling at the undivided rate would put times on the calendar
  // that ignore nine tenths of a ten-mailbox fleet.
  const inboxes = await campaignInboxes(campaign.workspaceId, campaign.fromAccountIds);
  const paced = dividedCampaignGap(
    campaign.sendGapSeconds,
    campaign.sendGapMaxSeconds,
    inboxes.length,
  );
  const gapMin = paced.min;
  const gapMax = Math.max(paced.max, gapMin);
  // Where this batch begins. Defaults to now; respace pins it to the run's
  // existing start so a settings change doesn't drag the schedule forward.
  const now = opts.startAtMs ?? Date.now();
  // Queue delays are always measured from the real clock, whatever the anchor.
  const realNow = Date.now();

  const jobs: Parameters<NonNullable<typeof manualStepQueue>["addBulk"]>[0] = [];
  const rowUpdates: { id: string; sequenceId?: string; nextSendAt?: Date }[] = [];
  let latestStep1: number | null = opts.startAfterMs ?? null;

  for (const row of rows) {
    const gap =
      gapMax > gapMin ? gapMin + Math.floor(Math.random() * (gapMax - gapMin + 1)) : gapMin;
    const step1Base =
      latestStep1 === null || gapMax === 0 ? now : Math.max(now, latestStep1 + gap * 1000);

    let cumulativeDays = 0;
    let soonest: { sequenceId: string; fireAt: Date } | null = null;
    for (const [index, sequence] of campaign.sequences.entries()) {
      cumulativeDays += sequence.delayValue;
      const fireAt = nextSendSlot(new Date(step1Base + cumulativeDays * 86_400_000), windowOpts);
      // Step 1 is what the gap chains on — later steps ride its offset.
      if (index === 0) latestStep1 = fireAt.getTime();
      jobs.push({
        name: "send-manual-step",
        data: {
          campaignId: campaign.id,
          sequenceStepId: sequence.id,
          contactId: row.contactId,
          scheduledFor: fireAt.toISOString(),
        },
        opts: {
          delay: Math.max(0, fireAt.getTime() - realNow),
          jobId: `manual-${campaign.id}-${sequence.id}-${row.contactId}`,
          attempts: 3,
          backoff: { type: "exponential", delay: 5 * 60 * 1000 },
          removeOnComplete: 500,
          removeOnFail: 500,
        },
      });
      if (fireAt.getTime() >= realNow && (!soonest || fireAt < soonest.fireAt)) {
        soonest = { sequenceId: sequence.id, fireAt };
      }
    }
    rowUpdates.push({ id: row.id, sequenceId: soonest?.sequenceId, nextSendAt: soonest?.fireAt });
  }

  const ADD_CHUNK = 200;
  try {
    for (let i = 0; i < jobs.length; i += ADD_CHUNK) {
      await manualStepQueue.addBulk(jobs.slice(i, i + ADD_CHUNK));
    }
  } catch (err) {
    // Same classification /launch relies on, so an Upstash quota wall surfaces
    // as an actionable 503 rather than a raw Redis reply inside a 500.
    throw classifyRedisError(err);
  }

  // One statement per chunk instead of one round-trip per contact. Prisma has
  // no bulk update with per-row values, and firing individual updates
  // concurrently just queues on the connection pool, so a large campaign
  // serialises no matter what concurrency we ask for.
  const UPDATE_CHUNK = 500;
  for (let i = 0; i < rowUpdates.length; i += UPDATE_CHUNK) {
    const chunk = rowUpdates.slice(i, i + UPDATE_CHUNK);
    const values = Prisma.join(
      chunk.map(
        (u) =>
          Prisma.sql`(${u.id}::text, ${u.sequenceId ?? null}::text, ${u.nextSendAt ?? null}::timestamptz)`,
      ),
    );
    await prisma.$executeRaw`
      UPDATE "CampaignContact" AS c
      SET "status" = 'SCHEDULED'::"CampaignContactStatus",
          "sequenceId" = v.seq,
          "nextSendAt" = v.ts
      FROM (VALUES ${values}) AS v(id, seq, ts)
      WHERE c."id" = v.id
    `;
  }

  return { contacts: rowUpdates.length, jobs: jobs.length };
}

/**
 * Re-lay a live campaign's pending sends using its CURRENT options.
 *
 * Editing the send gap or the sending window only rewrites the Campaign row.
 * Contacts already holding a nextSendAt keep it, and relaunching cannot fix
 * them either: enrol re-adds each job under the same deterministic jobId, and
 * BullMQ treats `add` on an existing id as a no-op. So the queued job keeps the
 * delay it was created with and the edit appears to do nothing.
 *
 * Dropping the jobs and clearing the times first is what makes the new settings
 * actually apply. Contacts that have already sent, replied, bounced, or are
 * staged for review are never touched — only SCHEDULED rows are re-laid, in
 * their existing order so nobody jumps the queue because of an edit.
 */
export async function respaceManualCampaign(campaignId: string): Promise<{
  respaced: number;
  cancelled: number;
  skipped?: "redis-unavailable";
}> {
  if (!manualStepQueue || !(await ensureConnection())) {
    return { respaced: 0, cancelled: 0, skipped: "redis-unavailable" };
  }

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { sequences: { orderBy: { stepOrder: "asc" } } },
  });
  if (!campaign || campaign.triggerType !== "MANUAL" || campaign.status !== "ACTIVE") {
    return { respaced: 0, cancelled: 0 };
  }
  if (campaign.sequences.length === 0) return { respaced: 0, cancelled: 0 };

  const pending = await prisma.campaignContact.findMany({
    where: { campaignId, status: "SCHEDULED", nextSendAt: { not: null } },
    select: { id: true, contactId: true, nextSendAt: true },
    orderBy: { nextSendAt: "asc" },
  });
  if (pending.length === 0) return { respaced: 0, cancelled: 0 };

  // Keep the run where the user put it. Re-pacing from `now` moved everything
  // to whenever they happened to hit save — editing at 2pm dragged a batch due
  // at 9:30am forward to 2pm, which is not what "apply changes" should mean.
  // Anchor on the earliest send already on the books instead, so a settings
  // change alters spacing and capacity without moving the start.
  //
  // Overdue runs still snap to now: an anchor in the past would schedule into
  // the past, and layoutAndQueue floors each delay at zero, which would fire
  // the whole batch at once.
  const earliest = pending[0].nextSendAt!.getTime();
  const anchor = Math.max(Date.now(), earliest);

  const cancelled = await cancelManualJobsForCampaign(campaignId);
  const { contacts: respaced, jobs } = await layoutAndQueue(campaign, pending, {
    startAtMs: anchor,
  });

  console.log(
    `[manual-scheduler] campaign=${campaignId}: respaced ${respaced} pending send(s) onto the current settings (dropped ${cancelled} job(s), queued ${jobs}).`,
  );
  return { respaced, cancelled };
}

export async function launchManualCampaign(
  campaignId: string,
  options?: { skipStaged?: boolean; onlyUnscheduled?: boolean },
) {
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

  // Make sure every target has a row, then schedule in one bulk pass.
  await prisma.campaignContact.createMany({
    data: contacts.map((contact) => ({
      workspaceId: campaign.workspaceId,
      campaignId: campaign.id,
      contactId: contact.id,
      status: "SCHEDULED" as const,
    })),
    skipDuplicates: true,
  });

  const rows = await prisma.campaignContact.findMany({
    where: { campaignId: campaign.id, contactId: { in: contacts.map((c) => c.id) } },
    select: { id: true, contactId: true, nextSendAt: true, status: true },
  });

  // Anyone this campaign has already mailed must never be enrolled again.
  //
  // A completed send clears nextSendAt but leaves the row SCHEDULED, so
  // "already delivered" and "never scheduled" looked identical to the filter
  // below. A relaunch therefore re-queued every past recipient: 62 of 72
  // contacts on the live campaign were sitting on a second copy of a mail they
  // had already received. SentMessage is the authority on what actually went
  // out, so ask it rather than inferring from scheduling state.
  const mailed = await prisma.sentMessage.findMany({
    where: { campaignId: campaign.id },
    select: { contactId: true },
    distinct: ["contactId"],
  });
  const alreadyMailed = new Set(mailed.map((row) => row.contactId));

  // On a relaunch, respaceManualCampaign has already re-laid everyone who was
  // waiting. Re-scheduling them here would redo the whole run for nothing —
  // and it was the bulk of the time a relaunch took, since each contact went
  // through the per-contact path. Only genuinely new contacts need laying out;
  // they chain behind the existing run rather than in front of it.
  // Two independent guards, because re-mailing someone is not recoverable.
  //
  // The row status is the primary signal now that a delivered send sets it,
  // but it only became reliable recently, so SentMessage backs it up for
  // anything sent before that. Either one is enough to exclude a contact —
  // neither has to be perfect on its own.
  const CONTACTED: ReadonlySet<string> = new Set([
    "SENT", "OPENED", "CLICKED", "REPLIED", "BOUNCED", "UNSUBSCRIBED", "FAILED",
  ]);
  const candidates = rows.filter(
    (r) => !alreadyMailed.has(r.contactId) && !CONTACTED.has(r.status),
  );
  const needing = options?.onlyUnscheduled
    ? candidates.filter((r) => r.nextSendAt === null)
    : candidates;
  if (needing.length === 0) return { scheduled: 0, contacts: 0 };

  const latest = options?.onlyUnscheduled
    ? await prisma.campaignContact.aggregate({
        where: { campaignId: campaign.id, nextSendAt: { not: null } },
        _max: { nextSendAt: true },
      })
    : null;

  const { contacts: laid, jobs } = await layoutAndQueue(campaign, needing, {
    startAfterMs: latest?._max.nextSendAt?.getTime() ?? null,
  });

  return { scheduled: jobs, contacts: laid };
}
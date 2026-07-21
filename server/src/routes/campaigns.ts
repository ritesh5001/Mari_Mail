import { Prisma, prisma } from "@marimail/db";
import { renderTemplate, validateTemplateCoverage } from "@marimail/email";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { scheduleEtaTrigger } from "../services/campaign-scheduler.js";
import { createETATriggers, matchCampaignsToETA } from "../services/campaign-matcher.js";
import {
  cancelManualJobsForCampaign,
  enrolAndScheduleManualContact,
  launchManualCampaign,
  ManualSchedulerUnavailableError,
} from "../services/campaign-manual-scheduler.js";
import { sendCampaignNow } from "../services/campaign-send-now.js";
import {
  buildTransport,
  classifyTransportError,
  resolveFromAddress,
} from "../services/email-account.service.js";
import { workspaceHasSendingInbox } from "../services/sending-readiness.js";

const NO_SENDING_INBOX_MESSAGE =
  "Connect at least one sending mailbox under /dashboard/inboxes before creating or activating a campaign.";

export const campaignRouter = Router();

const vesselTypeEnum = z.enum([
  "BULK_CARRIER",
  "TANKER_CRUDE",
  "TANKER_PRODUCT",
  "TANKER_CHEMICAL",
  "TANKER_LPG",
  "TANKER_LNG",
  "CONTAINER",
  "GENERAL_CARGO",
  "RORO",
  "OFFSHORE_PSV",
  "OFFSHORE_AHTS",
  "OFFSHORE_DRILL",
  "FERRY",
  "CRUISE",
  "DREDGER",
  "HEAVY_LIFT",
  "BARGE",
  "SUPPLY_BOAT",
  "RESEARCH",
  "OTHER",
]);

const sequenceSchema = z.object({
  stepOrder: z.number().int().min(1),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  bodyText: z.string().optional(),
  delayType: z
    .enum(["DAYS_BEFORE_ETA", "FIXED_DAYS"])
    .default("DAYS_BEFORE_ETA"),
  delayValue: z.number().int(),
  conditionType: z
    .enum(["ALWAYS", "IF_NOT_OPENED", "IF_NOT_REPLIED"])
    .default("ALWAYS"),
  abTestEnabled: z.boolean().default(false),
  abSubjectB: z.string().optional(),
  abBodyHtmlB: z.string().optional(),
  abSplit: z.number().int().min(1).max(99).default(50),
});

type SequenceInput = z.infer<typeof sequenceSchema>;

const targetConfigSchema = z.object({
  roles: z
    .array(z.enum(["SHIP_OWNER", "ISM_MANAGER", "COMMERCIAL_MANAGER"]))
    .default(["SHIP_OWNER", "ISM_MANAGER", "COMMERCIAL_MANAGER"]),
  marineRoles: z
    .array(
      z.enum([
        "FLEET_MANAGER",
        "SHIP_SUPERINTENDENT",
        "TECHNICAL_MANAGER",
        "CREWING_MANAGER",
        "CHARTERING_MANAGER",
        "PORT_CAPTAIN",
        "MARINE_SURVEYOR",
        "CLASS_SURVEYOR",
        "UNDERWRITER",
        "BROKER",
        "PORT_AGENT",
        "CHANDLER",
        "BUNKER_TRADER",
        "OPA_PROVIDER",
        "OTHER",
      ]),
    )
    .default([]),
  contactListIds: z.array(z.string()).default([]),
  contactIds: z.array(z.string()).default([]),
});

const triggerConfigSchema = z.object({
  portCodes: z.array(z.string()).default([]),
  vesselTypes: z.array(vesselTypeEnum).default([]),
  previousCargo: z.array(z.string()).default([]),
  nextCargo: z.array(z.string()).default([]),
  autoEnroll: z.boolean().default(true),
  priority: z.number().int().default(100),
});

const createCampaignSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]).default("DRAFT"),
  triggerType: z
    .enum([
      "MANUAL",
      "ETA_BASED",
      "PORT_BASED",
      "VESSEL_TYPE_BASED",
      "CARGO_CHANGE",
    ])
    .default("MANUAL"),
  sendingMode: z
    .enum(["PERSONAL_OUTREACH", "BULK_CAMPAIGN"])
    .default("PERSONAL_OUTREACH"),
  fromName: z.string().optional(),
  fromAccountIds: z.array(z.string()).default([]),
  rotationStrategy: z
    .enum(["ROUND_ROBIN", "WEIGHTED", "LEAST_USED"])
    .default("ROUND_ROBIN"),
  // Default aligned with the inbox's default limit (50). New inboxes need
  // to warm up before safely blasting hundreds/day; users bump this in Options.
  dailyLimit: z.number().int().min(1).max(100_000).default(50),
  // Gap between consecutive Step-1 sends. sendGapSeconds = minimum; when
  // sendGapMaxSeconds > sendGapSeconds a fresh random value in [min,max] is
  // chosen per send. Both omitted on create → workspace defaults apply.
  sendGapSeconds: z.number().int().min(0).max(86_400).optional(),
  sendGapMaxSeconds: z.number().int().min(0).max(86_400).optional(),
  timezone: z.string().default("UTC"),
  scheduleDays: z
    .array(z.number().int().min(0).max(6))
    .default([1, 2, 3, 4, 5]),
  scheduleHourStart: z.number().int().min(0).max(23).default(9),
  scheduleHourEnd: z.number().int().min(1).max(24).default(17),
  trackOpens: z.boolean().default(true),
  trackClicks: z.boolean().default(true),
  stopOnReply: z.boolean().default(true),
  stopOnBounce: z.boolean().default(true),
  stopOnUnsubscribe: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
  targetConfig: targetConfigSchema.default({
    roles: ["SHIP_OWNER", "ISM_MANAGER", "COMMERCIAL_MANAGER"],
    contactListIds: [],
    contactIds: [],
  }),
  triggerConfig: triggerConfigSchema.default({
    portCodes: [],
    vesselTypes: [],
    previousCargo: [],
    nextCargo: [],
    autoEnroll: true,
    priority: 100,
  }),
  sequences: z.array(sequenceSchema).default([]),
});

const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: z
    .enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"])
    .optional(),
});

const sampleValues = {
  vessel_name: "MV Pacific Eagle",
  imo_number: "IMO 9781234",
  vessel_type: "Bulk Carrier",
  dwt: "75,000 DWT",
  flag: "Marshall Islands",
  eta_port: "Fujairah Anchorage",
  eta_date: "15 June 2026",
  eta_days: "5 days",
  previous_cargo: "Coal",
  next_cargo: "Grain",
  ship_owner: "Pacific Carriers Ltd.",
  first_name: "Captain James",
  company: "Pacific Carriers Ltd.",
  title: "Fleet Manager",
  port_region: "Middle East",
};

// Generic 3-step cold outreach — no ETA or vessel references. Used when a
// MANUAL campaign is created without its own sequence steps. Only pulls from
// the always-populated contact fields (first_name, company, title) so it
// clears personalization coverage on any contact.
const coldDefaultSequences: SequenceInput[] = [
  {
    stepOrder: 1,
    subject: "Quick intro for {{company}}",
    bodyHtml:
      "<p>Hi {{first_name}},</p><p>I noticed {{company}} might benefit from what we do. Would you be open to a short conversation this week?</p>",
    delayType: "FIXED_DAYS" as const,
    delayValue: 0,
    conditionType: "ALWAYS" as const,
    abTestEnabled: false,
    abSplit: 50,
  },
  {
    stepOrder: 2,
    subject: "Following up — {{company}}",
    bodyHtml:
      "<p>Hi {{first_name}},</p><p>Circling back on my note. Happy to share how we've helped teams in similar roles to {{title}}. What's the best way to explore this?</p>",
    delayType: "FIXED_DAYS" as const,
    delayValue: 3,
    conditionType: "IF_NOT_REPLIED" as const,
    abTestEnabled: false,
    abSplit: 50,
  },
  {
    stepOrder: 3,
    subject: "Last note from me",
    bodyHtml:
      "<p>Hi {{first_name}},</p><p>Closing the loop here. If timing isn't right for {{company}}, no worries — just reply and I'll take you off the follow-up.</p>",
    delayType: "FIXED_DAYS" as const,
    delayValue: 5,
    conditionType: "IF_NOT_REPLIED" as const,
    abTestEnabled: false,
    abSplit: 50,
  },
];

const ipcDefaultSequences: SequenceInput[] = [
  {
    stepOrder: 1,
    subject:
      "Hold Cleaning Support Before {{eta_port}} Arrival - {{vessel_name}}",
    bodyHtml:
      "<p>Hello {{first_name}},</p><p>{{vessel_name}} is scheduled for {{eta_port}} on {{eta_date}}. Our marine operations team can support hold cleaning planning before arrival.</p>",
    delayType: "DAYS_BEFORE_ETA" as const,
    delayValue: 5,
    conditionType: "ALWAYS" as const,
    abTestEnabled: false,
    abSplit: 50,
  },
  {
    stepOrder: 2,
    subject: "Following Up: {{vessel_name}} ETA {{eta_port}} in 3 Days",
    bodyHtml:
      "<p>Hello {{first_name}},</p><p>Following up on {{vessel_name}} and the upcoming {{eta_port}} call. We can coordinate cleaning support around terminal timing.</p>",
    delayType: "DAYS_BEFORE_ETA" as const,
    delayValue: 3,
    conditionType: "IF_NOT_REPLIED" as const,
    abTestEnabled: false,
    abSplit: 50,
  },
  {
    stepOrder: 3,
    subject: "Final Reminder: {{vessel_name}} Arriving {{eta_port}} Tomorrow",
    bodyHtml:
      "<p>Hello {{first_name}},</p><p>{{vessel_name}} arrives tomorrow. If hold cleaning is still open, our team can align equipment and crew availability.</p>",
    delayType: "DAYS_BEFORE_ETA" as const,
    delayValue: 1,
    conditionType: "IF_NOT_REPLIED" as const,
    abTestEnabled: false,
    abSplit: 50,
  },
  {
    stepOrder: 4,
    subject: "Operations Team Ready: {{vessel_name}} Arrival Today",
    bodyHtml:
      "<p>Hello {{first_name}},</p><p>{{vessel_name}} is due today at {{eta_port}}. We are available for short-notice marine cleaning support.</p>",
    delayType: "DAYS_BEFORE_ETA" as const,
    delayValue: 0,
    conditionType: "IF_NOT_REPLIED" as const,
    abTestEnabled: false,
    abSplit: 50,
  },
  {
    stepOrder: 5,
    subject: "How Did {{vessel_name}}'s Port Call Go?",
    bodyHtml:
      "<p>Hello {{first_name}},</p><p>I wanted to check whether the {{eta_port}} call went smoothly and whether any follow-up cleaning support is needed.</p>",
    delayType: "DAYS_BEFORE_ETA" as const,
    delayValue: -2,
    conditionType: "IF_NOT_REPLIED" as const,
    abTestEnabled: false,
    abSplit: 50,
  },
];

function defaultDaysBefore(sequences: SequenceInput[]) {
  return sequences
    .filter((sequence) => sequence.delayType === "DAYS_BEFORE_ETA")
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((sequence) => sequence.delayValue);
}

async function senderWarnings(
  workspaceId: string,
  sendingMode: "PERSONAL_OUTREACH" | "BULK_CAMPAIGN",
  fromAccountIds: string[],
) {
  if (sendingMode !== "BULK_CAMPAIGN" || fromAccountIds.length === 0) return [];
  const personal = await prisma.emailAccount.findMany({
    where: {
      workspaceId,
      id: { in: fromAccountIds },
      OR: [
        { mode: "PERSONAL_OUTREACH" },
        { provider: { in: ["GMAIL", "OUTLOOK", "SMTP"] } },
      ],
    },
    select: { email: true, provider: true },
  });
  if (!personal.length) return [];
  return [
    `Bulk campaign uses personal mailbox senders (${personal.map((item) => `${item.email}/${item.provider}`).join(", ")}). Keep volumes low to protect sender reputation.`,
  ];
}

async function createTriggerRules(
  input: z.infer<typeof createCampaignSchema>,
  campaignId: string,
  workspaceId: string,
) {
  if (input.status !== "ACTIVE") return;

  if (
    input.triggerType === "ETA_BASED" ||
    input.triggerType === "PORT_BASED" ||
    input.triggerType === "VESSEL_TYPE_BASED"
  ) {
    for (const portCode of input.triggerConfig.portCodes) {
      await prisma.portCampaignRule.create({
        data: {
          workspaceId,
          portCode: portCode.toUpperCase(),
          vesselTypes: input.triggerConfig.vesselTypes,
          campaignId,
          autoEnroll: input.triggerConfig.autoEnroll,
          priority: input.triggerConfig.priority,
        },
      });
    }
  }

  if (input.triggerType === "CARGO_CHANGE") {
    await prisma.cargoChangeTrigger.create({
      data: {
        workspaceId,
        campaignId,
        previousCargo: input.triggerConfig.previousCargo.map((item) =>
          item.toUpperCase(),
        ),
        nextCargo: input.triggerConfig.nextCargo.map((item) =>
          item.toUpperCase(),
        ),
        vesselTypes: input.triggerConfig.vesselTypes,
        autoEnroll: input.triggerConfig.autoEnroll,
      },
    });
  }
}

campaignRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const campaigns = await prisma.campaign.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: {
        sequences: { orderBy: { stepOrder: "asc" } },
        _count: {
          select: {
            // Staged candidates are awaiting review, not enrolled — counting
            // them here would overstate how many contacts a campaign has.
            contacts: { where: { status: { not: "STAGED" } } },
            emailEvents: true,
            etaTriggers: true,
          },
        },
      },
    });
    return sendData(res, { campaigns });
  } catch (error) {
    return next(error);
  }
});

campaignRouter.get("/template/ipc", requireAuth, (_req, res) => {
  return sendData(res, { sequences: ipcDefaultSequences });
});

campaignRouter.post("/preview", requireAuth, async (req, res) => {
  const input = z
    .object({ subject: z.string(), bodyHtml: z.string() })
    .safeParse(req.body);
  if (!input.success) {
    return sendError(
      res,
      400,
      "VALIDATION_ERROR",
      input.error.issues[0]?.message ?? "Invalid input",
    );
  }
  const coverage = validateTemplateCoverage(
    [input.data.subject, input.data.bodyHtml],
    sampleValues,
  );
  return sendData(res, {
    subject: renderTemplate(input.data.subject, sampleValues),
    bodyHtml: renderTemplate(input.data.bodyHtml, sampleValues),
    coverage,
  });
});

campaignRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid input",
      );
    }
    const { workspaceId } = (req as AuthedRequest).auth;

    if (!(await workspaceHasSendingInbox(workspaceId))) {
      return sendError(res, 409, "NO_SENDING_INBOX", NO_SENDING_INBOX_MESSAGE);
    }

    // New campaigns inherit the workspace's default random send-gap range so
    // outgoing mail is human-paced out of the box (5–20 min by default).
    const workspaceDefaults = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { defaultSendGapMinSeconds: true, defaultSendGapMaxSeconds: true },
    });
    const sendGapSeconds =
      parsed.data.sendGapSeconds ?? workspaceDefaults?.defaultSendGapMinSeconds ?? 0;
    const sendGapMaxSeconds =
      parsed.data.sendGapMaxSeconds ?? workspaceDefaults?.defaultSendGapMaxSeconds ?? 0;

    const sequences: SequenceInput[] = parsed.data.sequences.length
      ? parsed.data.sequences
      : parsed.data.triggerType === "MANUAL"
        ? coldDefaultSequences
        : ipcDefaultSequences;
    const coverage = validateTemplateCoverage(
      sequences.flatMap((sequence) => [sequence.subject, sequence.bodyHtml]),
      sampleValues,
    );
    if (coverage.coverage < 80) {
      return sendError(
        res,
        400,
        "PERSONALIZATION_COVERAGE_LOW",
        "At least 80% of personalization variables must resolve",
      );
    }

    const campaign = await prisma.campaign.create({
      data: {
        workspaceId,
        name: parsed.data.name,
        description: parsed.data.description,
        status: parsed.data.status,
        triggerType: parsed.data.triggerType,
        sendingMode: parsed.data.sendingMode,
        fromName: parsed.data.fromName,
        fromAccountIds: parsed.data.fromAccountIds,
        rotationStrategy: parsed.data.rotationStrategy,
        dailyLimit: parsed.data.dailyLimit,
        sendGapSeconds,
        sendGapMaxSeconds,
        timezone: parsed.data.timezone,
        scheduleDays: parsed.data.scheduleDays,
        scheduleHourStart: parsed.data.scheduleHourStart,
        scheduleHourEnd: parsed.data.scheduleHourEnd,
        trackOpens: parsed.data.trackOpens,
        trackClicks: parsed.data.trackClicks,
        stopOnReply: parsed.data.stopOnReply,
        stopOnBounce: parsed.data.stopOnBounce,
        stopOnUnsubscribe: parsed.data.stopOnUnsubscribe,
        tags: parsed.data.tags,
        targetConfig: parsed.data.targetConfig as Prisma.InputJsonValue,
        triggerConfig: parsed.data.triggerConfig as Prisma.InputJsonValue,
        defaultDaysBefore: defaultDaysBefore(sequences),
        sequences: {
          create: sequences.map((sequence) => ({
            stepOrder: sequence.stepOrder,
            subject: sequence.subject,
            bodyHtml: sequence.bodyHtml,
            bodyText: sequence.bodyText,
            delayType: sequence.delayType,
            delayValue: sequence.delayValue,
            conditionType: sequence.conditionType,
            abTestEnabled: sequence.abTestEnabled ?? false,
            abSubjectB: sequence.abSubjectB,
            abBodyHtmlB: sequence.abBodyHtmlB,
            abSplit: sequence.abSplit ?? 50,
          })),
        },
      },
      include: { sequences: true },
    });

    await createTriggerRules(
      { ...parsed.data, sequences },
      campaign.id,
      workspaceId,
    );
    return sendData(
      res,
      {
        campaign,
        coverage,
        warnings: await senderWarnings(
          workspaceId,
          parsed.data.sendingMode,
          parsed.data.fromAccountIds,
        ),
      },
      201,
    );
  } catch (error) {
    return next(error);
  }
});

/**
 * Health snapshot of the BullMQ queues that drive campaign sending. Lets a
 * super-admin verify the worker is alive and processing jobs — if `delayed`
 * keeps growing while `completed` stays flat, the worker isn't reading the
 * queue (or `START_WORKERS=false`, or Redis is unreachable).
 *
 * MUST be declared before `GET /:id` — otherwise Express's ordered matcher
 * treats "queue-health" as a campaign ID and returns 404.
 */
campaignRouter.get("/queue-health", requireAuth, requireSuperAdmin, async (_req, res, next) => {
  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      return sendData(res, {
        ok: false,
        reason: "REDIS_URL is not set on the backend — manual + ETA campaigns cannot be queued or sent.",
        workersEnabled: process.env.START_WORKERS !== "false",
      });
    }

    const { Queue } = await import("bullmq");
    const { Redis } = await import("ioredis");
    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    connection.on("error", () => undefined);

    try {
      await connection.connect();
    } catch (error) {
      connection.disconnect();
      return sendData(res, {
        ok: false,
        reason: `Redis is unreachable: ${(error as Error).message}`,
        workersEnabled: process.env.START_WORKERS !== "false",
      });
    }

    const queueNames = ["manual-step", "eta-step", "email-send"] as const;
    const result: Record<string, unknown> = {};
    const failures: Array<{ queue: string; id: string | undefined; attemptsMade: number; failedReason: string | undefined; timestamp: number | undefined }> = [];

    try {
      for (const name of queueNames) {
        const queue = new Queue(name, { connection });
        const counts = await queue.getJobCounts(
          "wait",
          "active",
          "delayed",
          "completed",
          "failed",
        );
        result[name] = counts;
        if (name === "manual-step" || name === "eta-step") {
          const recent = await queue.getJobs(["failed"], 0, 4);
          for (const job of recent) {
            failures.push({
              queue: name,
              id: job.id,
              attemptsMade: job.attemptsMade,
              failedReason: job.failedReason,
              timestamp: job.timestamp,
            });
          }
        }
        await queue.close();
      }
    } finally {
      connection.disconnect();
    }

    return sendData(res, {
      ok: true,
      workersEnabled: process.env.START_WORKERS !== "false",
      queues: result,
      recentFailures: failures,
    });
  } catch (error) {
    return next(error);
  }
});

campaignRouter.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, workspaceId },
      include: {
        sequences: { orderBy: { stepOrder: "asc" } },
        contacts: {
          take: 50,
          orderBy: { updatedAt: "desc" },
          include: { contact: true },
        },
        emailEvents: { take: 100, orderBy: { occurredAt: "desc" } },
      },
    });
    if (!campaign)
      return sendError(res, 404, "NOT_FOUND", "Campaign not found");
    return sendData(res, campaign);
  } catch (error) {
    return next(error);
  }
});

campaignRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const parsed = updateCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid input",
      );
    }
    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.campaign.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!existing)
      return sendError(res, 404, "NOT_FOUND", "Campaign not found");

    const sequencesInput = parsed.data.sequences;

    const campaign = await prisma.$transaction(async (tx) => {
      const updated = await tx.campaign.update({
        where: { id: existing.id },
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          status: parsed.data.status,
          triggerType: parsed.data.triggerType,
          sendingMode: parsed.data.sendingMode,
          fromName: parsed.data.fromName,
          fromAccountIds: parsed.data.fromAccountIds,
          rotationStrategy: parsed.data.rotationStrategy,
          dailyLimit: parsed.data.dailyLimit,
          sendGapSeconds: parsed.data.sendGapSeconds,
          sendGapMaxSeconds: parsed.data.sendGapMaxSeconds,
          timezone: parsed.data.timezone,
          scheduleDays: parsed.data.scheduleDays,
          scheduleHourStart: parsed.data.scheduleHourStart,
          scheduleHourEnd: parsed.data.scheduleHourEnd,
          trackOpens: parsed.data.trackOpens,
          trackClicks: parsed.data.trackClicks,
          stopOnReply: parsed.data.stopOnReply,
          stopOnBounce: parsed.data.stopOnBounce,
          stopOnUnsubscribe: parsed.data.stopOnUnsubscribe,
          tags: parsed.data.tags,
          targetConfig: parsed.data.targetConfig as
            | Prisma.InputJsonValue
            | undefined,
          triggerConfig: parsed.data.triggerConfig as
            | Prisma.InputJsonValue
            | undefined,
          ...(sequencesInput !== undefined
            ? { defaultDaysBefore: defaultDaysBefore(sequencesInput) }
            : {}),
        },
      });

      // Sequence replace-all: only when the caller sent a sequences array.
      // Existing CampaignContact rows keep their sequenceId FKs (Prisma
      // schema has onDelete: SetNull), so deleting old sequences is safe.
      if (sequencesInput !== undefined) {
        await tx.campaignSequence.deleteMany({ where: { campaignId: existing.id } });
        if (sequencesInput.length) {
          await tx.campaignSequence.createMany({
            data: sequencesInput.map((sequence) => ({
              campaignId: existing.id,
              stepOrder: sequence.stepOrder,
              subject: sequence.subject,
              bodyHtml: sequence.bodyHtml,
              bodyText: sequence.bodyText,
              delayType: sequence.delayType,
              delayValue: sequence.delayValue,
              conditionType: sequence.conditionType,
              abTestEnabled: sequence.abTestEnabled,
              abSubjectB: sequence.abSubjectB,
              abBodyHtmlB: sequence.abBodyHtmlB,
              abSplit: sequence.abSplit,
            })),
          });
        }
      }

      return updated;
    });

    return sendData(res, campaign);
  } catch (error) {
    return next(error);
  }
});

campaignRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    // Workspace-scoped lookup: users can only delete campaigns their workspace
    // owns. Cascading FKs on CampaignSequence, CampaignContact, EmailEvent,
    // ETATrigger, PortCampaignRule, CargoChangeTrigger clean up automatically.
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, workspaceId },
      select: { id: true, name: true, status: true },
    });
    if (!campaign) {
      return sendError(res, 404, "NOT_FOUND", "Campaign not found");
    }

    // Best-effort: strip pending BullMQ jobs first so the worker doesn't
    // wake up after the delete and try to send from CampaignContact rows
    // that no longer exist. Redis unreachable is non-fatal — the worker
    // would eventually fail those jobs when it can't find the row.
    let cancelledJobs = 0;
    try {
      cancelledJobs = await cancelManualJobsForCampaign(campaign.id);
    } catch (jobErr) {
      console.warn(
        `[campaigns] failed to cancel manual jobs for ${campaign.id}: ${(jobErr as Error).message}`,
      );
    }

    await prisma.campaign.delete({ where: { id: campaign.id } });
    return sendData(res, { id: campaign.id, cancelledJobs });
  } catch (error) {
    return next(error);
  }
});

campaignRouter.post("/:id/activate", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!campaign)
      return sendError(res, 404, "NOT_FOUND", "Campaign not found");

    if (!(await workspaceHasSendingInbox(workspaceId))) {
      return sendError(res, 409, "NO_SENDING_INBOX", NO_SENDING_INBOX_MESSAGE);
    }

    // Fail fast if the campaign can't possibly fire — an ETA-driven campaign
    // needs either (a) vessels in its target list (so matcher fires via
    // vessel-in-list) or (b) an explicit port/cargo rule (advanced case).
    // Without any of those, matchCampaignsToETA will never produce an
    // ETATrigger and the campaign sits in ACTIVE silently emitting nothing.
    if (campaign.triggerType === "ETA_BASED" || campaign.triggerType === "PORT_BASED") {
      const targetConfig = campaign.targetConfig as { contactListIds?: unknown } | null;
      const listIds = Array.isArray(targetConfig?.contactListIds)
        ? (targetConfig?.contactListIds as unknown[]).filter((id): id is string => typeof id === "string")
        : [];

      const [portRules, cargoTriggers, listVesselCount] = await Promise.all([
        prisma.portCampaignRule.count({ where: { campaignId: campaign.id } }),
        prisma.cargoChangeTrigger.count({ where: { campaignId: campaign.id } }),
        listIds.length
          ? prisma.listVessel.count({ where: { listId: { in: listIds } } })
          : Promise.resolve(0),
      ]);
      if (portRules === 0 && cargoTriggers === 0 && listVesselCount === 0) {
        return sendError(
          res,
          400,
          "NO_TRIGGER_RULE",
          "This ETA campaign has no vessels in its target list and no port/cargo rule. Add vessels to the list from the ETA Radar (or attach a port rule) before launching — otherwise no ETA can ever match it.",
        );
      }
    }

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "ACTIVE" },
    });

    // Return immediately so the client sees a fast Launch response — the ETA
    // backscan below can take 30+ seconds on lists with many vessels, which
    // times out at the reverse proxy and surfaces as a "504 / not valid JSON"
    // error on the client. Instead we flip status → ACTIVE, respond, and run
    // the backscan + trigger scheduling in the background. The worker + the
    // ongoing ETA-matcher will still enrol future ETAs the same way; the
    // backscan is only an eager "light up existing pending ETAs" pass.
    sendData(res, { campaign: updated, scheduled: [], async: true });

    // ---- Background work (fire-and-forget) ---------------------------------
    // Wrapped in setImmediate so any error can't affect the already-sent
    // response, and logged loudly so ops can see it in journalctl.
    setImmediate(() => {
      void (async () => {
        try {
          if (
            campaign.triggerType === "ETA_BASED" ||
            campaign.triggerType === "PORT_BASED"
          ) {
            const targetConfig = campaign.targetConfig as
              | { contactListIds?: unknown }
              | null;
            const listIds = Array.isArray(targetConfig?.contactListIds)
              ? (targetConfig?.contactListIds as unknown[]).filter(
                  (id): id is string => typeof id === "string",
                )
              : [];
            if (listIds.length > 0) {
              const vessels = await prisma.listVessel.findMany({
                where: { listId: { in: listIds } },
                select: { vesselId: true },
              });
              if (vessels.length > 0) {
                const pendingEtas = await prisma.vesselETA.findMany({
                  where: {
                    vesselId: { in: vessels.map((row) => row.vesselId) },
                    eta: { gt: new Date() },
                  },
                  select: { id: true },
                });
                for (const eta of pendingEtas) {
                  try {
                    const matches = await matchCampaignsToETA(eta.id);
                    const relevant = matches
                      .filter(
                        (m) => m.autoEnroll && m.campaignId === campaign.id,
                      )
                      .map((m) => m.campaignId);
                    if (relevant.length === 0) continue;
                    const newTriggers = await createETATriggers(
                      eta.id,
                      relevant,
                    );
                    await Promise.all(
                      newTriggers.map((trigger) => scheduleEtaTrigger(trigger.id)),
                    );
                  } catch (err) {
                    console.warn(
                      `[campaign-launch] eta-backscan failed eta=${eta.id}: ${(err as Error).message}`,
                    );
                  }
                }
              }
            }
          }

          const triggers = await prisma.eTATrigger.findMany({
            where: {
              campaignId: campaign.id,
              status: { in: ["PENDING", "ACTIVE"] },
            },
            select: { id: true },
          });
          await Promise.all(
            triggers.map((trigger) => scheduleEtaTrigger(trigger.id)),
          );
          console.log(
            `[campaign-launch] async backscan complete for campaign=${campaign.id} (${triggers.length} triggers scheduled)`,
          );
        } catch (err) {
          console.error(
            `[campaign-launch] async backscan crashed for campaign=${campaign.id}:`,
            err,
          );
        }
      })();
    });
    return;
  } catch (error) {
    return next(error);
  }
});

// Launch a manual (fixed-schedule, ReachInbox-style) campaign: enrol the
// targeted contacts and enqueue every sequence step on a fixed timeline.
campaignRouter.post("/:id/launch", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!campaign)
      return sendError(res, 404, "NOT_FOUND", "Campaign not found");
    if (campaign.triggerType !== "MANUAL") {
      return sendError(
        res,
        400,
        "WRONG_TRIGGER_TYPE",
        "Only manual campaigns can be launched this way. Use activate for ETA campaigns.",
      );
    }
    // Launch is idempotent for MANUAL campaigns — allow DRAFT / PAUSED / ACTIVE
    // so that switching an ETA campaign to Manual (which leaves the row in
    // ACTIVE from the prior activate) can still enrol contacts by clicking
    // Launch. launchManualCampaign upserts CampaignContact rows and
    // deduplicates BullMQ jobs by jobId, so a second run doesn't double-send.
    if (!["DRAFT", "PAUSED", "ACTIVE"].includes(campaign.status)) {
      return sendError(
        res,
        400,
        "INVALID_STATUS",
        `Campaign is ${campaign.status}; only DRAFT, PAUSED, or ACTIVE campaigns can be launched.`,
      );
    }

    if (!(await workspaceHasSendingInbox(workspaceId))) {
      return sendError(res, 409, "NO_SENDING_INBOX", NO_SENDING_INBOX_MESSAGE);
    }

    // Captured before the update below: an already-ACTIVE campaign means this
    // is a re-launch, so contacts staged for review must not be swept in.
    const isRelaunch = campaign.status === "ACTIVE";
    const updated = campaign.status === "ACTIVE"
      ? campaign
      : await prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: "ACTIVE" },
        });
    try {
      const result = await launchManualCampaign(campaign.id, { skipStaged: isRelaunch });
      // Redis reachable but not usable — surface it explicitly so the client
      // shows a helpful message instead of a silent no-op.
      if ("skipped" in result && result.skipped === "redis-unavailable") {
        return sendError(
          res,
          503,
          "SCHEDULER_UNAVAILABLE",
          "Send queue (Redis) is unreachable — no sends were scheduled. Check REDIS_URL / Upstash status and retry.",
        );
      }
      return sendData(res, { campaign: updated, ...result });
    } catch (schedulerErr) {
      if (schedulerErr instanceof ManualSchedulerUnavailableError) {
        const code =
          schedulerErr.kind === "redis-quota"
            ? "REDIS_QUOTA_EXHAUSTED"
            : schedulerErr.kind === "redis-unavailable"
              ? "SCHEDULER_UNAVAILABLE"
              : "SCHEDULER_ERROR";
        return sendError(res, 503, code, schedulerErr.message);
      }
      throw schedulerErr;
    }
  } catch (error) {
    return next(error);
  }
});

// ─── Staged review ────────────────────────────────────────────────────────────
// Contacts pulled in by a list change on a live campaign are STAGED rather than
// enrolled (see campaign-list-reconciler). These three routes are the review
// surface: read the queue, confirm the picks, drop the rest.

// Apollo persists unrevealed people with a placeholder address. They resolve as
// campaign targets but resolveCampaignContacts drops them at send time, so
// confirming one would enrol a contact that can never be emailed.
const LOCKED_EMAIL_SUFFIX = "@unknown.local";

const stagedContactsSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(500),
});

type StagedGroup = {
  vessel: {
    id: string;
    vesselName: string;
    imoNumber: string;
    nextEta: string | null;
    nextEtaPort: string | null;
  } | null;
  companyNames: string[];
  contacts: Array<{
    contactId: string;
    firstName: string;
    lastName: string;
    email: string;
    title: string | null;
    companyName: string;
    emailStatus: string;
    locked: boolean;
  }>;
};

campaignRouter.get("/:id/staged", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, workspaceId },
      select: { id: true },
    });
    if (!campaign) return sendError(res, 404, "NOT_FOUND", "Campaign not found");

    const rows = await prisma.campaignContact.findMany({
      where: { campaignId: campaign.id, status: "STAGED" },
      include: {
        contact: true,
        vessel: {
          include: {
            shipOwnerCompany: { select: { companyName: true } },
            ismManagerCompany: { select: { companyName: true } },
            commercialManagerCompany: { select: { companyName: true } },
            etas: {
              where: { eta: { gt: new Date() } },
              orderBy: { eta: "asc" },
              take: 1,
              select: { eta: true, destinationPort: true },
            },
          },
        },
      },
      orderBy: [{ stagedAt: "desc" }, { createdAt: "desc" }],
      take: 500,
    });

    // Group by the vessel that surfaced each candidate. vesselId null means no
    // vessel signal linked them — they still belong in the review queue.
    const groups = new Map<string, StagedGroup>();
    for (const row of rows) {
      const key = row.vesselId ?? "__none__";
      if (!groups.has(key)) {
        const nextEta = row.vessel?.etas[0] ?? null;
        groups.set(key, {
          vessel: row.vessel
            ? {
                id: row.vessel.id,
                vesselName: row.vessel.vesselName,
                imoNumber: row.vessel.imoNumber,
                nextEta: nextEta?.eta?.toISOString() ?? null,
                nextEtaPort: nextEta?.destinationPort ?? null,
              }
            : null,
          companyNames: row.vessel
            ? Array.from(
                new Set(
                  [
                    row.vessel.shipOwnerCompany?.companyName,
                    row.vessel.ismManagerCompany?.companyName,
                    row.vessel.commercialManagerCompany?.companyName,
                  ].filter((name): name is string => Boolean(name)),
                ),
              )
            : [],
          contacts: [],
        });
      }
      groups.get(key)!.contacts.push({
        contactId: row.contactId,
        firstName: row.contact.firstName,
        lastName: row.contact.lastName,
        email: row.contact.email,
        title: row.contact.title,
        companyName: row.contact.companyName,
        emailStatus: row.contact.emailStatus,
        locked: row.contact.email.toLowerCase().endsWith(LOCKED_EMAIL_SUFFIX),
      });
    }

    return sendData(res, { groups: Array.from(groups.values()), totalStaged: rows.length });
  } catch (error) {
    return next(error);
  }
});

/**
 * Per-send audit log for a campaign. Returns one row per SENT / FAILED /
 * BOUNCED EmailEvent, with the recipient, the step (template), the inbox
 * that sent it (from EmailEvent.metadata.inboxId), and any subsequent
 * open/click/reply event flags for the same message.
 */
campaignRouter.get("/:id/sends", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, workspaceId },
      select: { id: true },
    });
    if (!campaign) return sendError(res, 404, "NOT_FOUND", "Campaign not found");

    const take = Math.min(Number(req.query.take) || 100, 500);
    const skip = Math.max(Number(req.query.skip) || 0, 0);

    // Sort allowlist for the sends table. Unknown/absent → default newest-first.
    const dir: "asc" | "desc" = req.query.dir === "asc" ? "asc" : "desc";
    const orderBy: Prisma.EmailEventOrderByWithRelationInput =
      req.query.sort === "status" ? { eventType: dir } : { occurredAt: req.query.sort === "when" ? dir : "desc" };

    // SENT + FAILED + hard/soft bounce → the "outgoing" audit. Follow-up
    // OPENED / CLICKED / REPLIED events are folded into flags on their SENT
    // row via messageId/trackingId join below.
    const OUTGOING_TYPES = ["SENT", "FAILED", "BOUNCED_HARD", "BOUNCED_SOFT"] as const;

    const [rows, total] = await Promise.all([
      prisma.emailEvent.findMany({
        where: {
          campaignId: campaign.id,
          eventType: { in: OUTGOING_TYPES as unknown as Prisma.EnumEmailEventTypeFilter["in"] },
        },
        orderBy,
        take,
        skip,
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              companyName: true,
            },
          },
          sequence: {
            select: {
              id: true,
              stepOrder: true,
              subject: true,
            },
          },
        },
      }),
      prisma.emailEvent.count({
        where: {
          campaignId: campaign.id,
          eventType: { in: OUTGOING_TYPES as unknown as Prisma.EnumEmailEventTypeFilter["in"] },
        },
      }),
    ]);

    // Batch-fetch the inbox rows referenced by metadata.inboxId. We only need
    // the from-address label, so cache-hit workspaces (5–20 inboxes) cost one
    // small query regardless of page size.
    const inboxIds = Array.from(
      new Set(
        rows
          .map((row) => {
            const meta = row.metadata as { inboxId?: unknown } | null;
            return typeof meta?.inboxId === "string" ? meta.inboxId : null;
          })
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const inboxRows = inboxIds.length
      ? await prisma.emailAccount.findMany({
          where: { workspaceId, id: { in: inboxIds } },
          select: { id: true, email: true, fromEmail: true, displayName: true },
        })
      : [];
    const inboxById = new Map(inboxRows.map((i) => [i.id, i]));

    // Follow-up events keyed by messageId (preferred) and trackingId
    // (fallback for providers that don't return a messageId). For each row
    // we mark whether an OPENED / CLICKED / REPLIED event exists for the
    // same message.
    const messageIds = rows.map((r) => r.messageId).filter((id): id is string => Boolean(id));
    const trackingIds = rows.map((r) => r.trackingId).filter((id): id is string => Boolean(id));
    const followUps = await prisma.emailEvent.findMany({
      where: {
        campaignId: campaign.id,
        eventType: { in: ["OPENED", "CLICKED", "REPLIED"] },
        OR: [
          messageIds.length ? { messageId: { in: messageIds } } : undefined,
          trackingIds.length ? { trackingId: { in: trackingIds } } : undefined,
        ].filter(Boolean) as Prisma.EmailEventWhereInput[],
      },
      select: { messageId: true, trackingId: true, eventType: true },
    });
    const flagsFor = (messageId: string | null, trackingId: string | null) => {
      const opened = followUps.some(
        (e) =>
          e.eventType === "OPENED" &&
          ((messageId && e.messageId === messageId) ||
            (trackingId && e.trackingId === trackingId)),
      );
      const clicked = followUps.some(
        (e) =>
          e.eventType === "CLICKED" &&
          ((messageId && e.messageId === messageId) ||
            (trackingId && e.trackingId === trackingId)),
      );
      const replied = followUps.some(
        (e) =>
          e.eventType === "REPLIED" &&
          ((messageId && e.messageId === messageId) ||
            (trackingId && e.trackingId === trackingId)),
      );
      return { opened, clicked, replied };
    };

    const sends = rows.map((row) => {
      const meta = row.metadata as {
        inboxId?: unknown;
        variant?: unknown;
        message?: unknown;
        responseCode?: unknown;
      } | null;
      const inboxId = typeof meta?.inboxId === "string" ? meta.inboxId : null;
      const inbox = inboxId ? inboxById.get(inboxId) : null;
      return {
        id: row.id,
        occurredAt: row.occurredAt.toISOString(),
        eventType: row.eventType,
        messageId: row.messageId,
        contact: row.contact
          ? {
              id: row.contact.id,
              name: [row.contact.firstName, row.contact.lastName]
                .filter(Boolean)
                .join(" ")
                .trim(),
              email: row.contact.email,
              company: row.contact.companyName,
            }
          : null,
        step: row.sequence
          ? { stepOrder: row.sequence.stepOrder, subject: row.sequence.subject }
          : null,
        from: inbox
          ? {
              id: inbox.id,
              email: inbox.fromEmail ?? inbox.email,
              displayName: inbox.displayName,
            }
          : null,
        variant: typeof meta?.variant === "string" ? meta.variant : null,
        failureReason:
          row.eventType === "SENT"
            ? null
            : typeof meta?.message === "string"
              ? meta.message
              : null,
        ...flagsFor(row.messageId, row.trackingId),
      };
    });

    return sendData(res, { sends, total, take, skip });
  } catch (error) {
    return next(error);
  }
});

/**
 * Reset a single contact's campaign state so Send Now / the next scheduled
 * step can fire again. Used for testing (repeated re-sends to the same
 * recipient) — normal production flow doesn't need this because the
 * terminal-status guard is what prevents accidental duplicate sends.
 *
 * Behaviour:
 *   - CampaignContact.status → PENDING, currentStep → 0, nextSendAt → null.
 *   - No EmailEvent history is deleted; the Sent tab keeps the audit trail.
 *   - The row is upserted so this also works for contacts who were never
 *     enrolled (though `Send Now` handles that path too).
 */
campaignRouter.post(
  "/:id/contacts/:contactId/reset",
  requireAuth,
  async (req, res, next) => {
    try {
      const { workspaceId } = (req as AuthedRequest).auth;
      const { id: campaignId, contactId } = req.params;

      const campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, workspaceId },
        select: { id: true, workspaceId: true },
      });
      if (!campaign) {
        return sendError(res, 404, "NOT_FOUND", "Campaign not found");
      }

      // A contact may be workspace-owned OR a global contact reachable via
      // one of the campaign's target lists — mirror how send-now resolves
      // targets so this endpoint accepts the same set.
      const contact = await prisma.contact.findFirst({
        where: {
          id: contactId,
          OR: [
            { workspaceId },
            { workspaceId: null },
          ],
        },
        select: { id: true, email: true },
      });
      if (!contact) {
        return sendError(res, 404, "NOT_FOUND", "Contact not found");
      }

      const reset = await prisma.campaignContact.upsert({
        where: {
          campaignId_contactId: { campaignId: campaign.id, contactId: contact.id },
        },
        update: {
          status: "PENDING",
          currentStep: 0,
          nextSendAt: null,
          lastEventAt: null,
        },
        create: {
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          contactId: contact.id,
          status: "PENDING",
        },
        select: { id: true, status: true, currentStep: true },
      });

      return sendData(res, { reset, contact: { id: contact.id, email: contact.email } });
    } catch (error) {
      return next(error);
    }
  },
);

campaignRouter.post("/:id/staged/confirm", requireAuth, async (req, res, next) => {
  try {
    const input = stagedContactsSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, workspaceId },
      include: { sequences: { orderBy: { stepOrder: "asc" } } },
    });
    if (!campaign) return sendError(res, 404, "NOT_FOUND", "Campaign not found");

    if (!(await workspaceHasSendingInbox(workspaceId))) {
      return sendError(res, 409, "NO_SENDING_INBOX", NO_SENDING_INBOX_MESSAGE);
    }

    // Scoped to STAGED so a double-confirm is a no-op rather than a re-enrol,
    // and so a concurrent dismiss can't be raced.
    const staged = await prisma.campaignContact.findMany({
      where: { campaignId: campaign.id, contactId: { in: input.data.contactIds }, status: "STAGED" },
      include: { contact: { select: { email: true } } },
    });
    if (!staged.length) {
      return sendData(res, { confirmed: 0, scheduled: 0, warnings: [] });
    }

    const locked = staged.filter((row) =>
      row.contact.email.toLowerCase().endsWith(LOCKED_EMAIL_SUFFIX),
    );
    const confirmable = staged.filter(
      (row) => !row.contact.email.toLowerCase().endsWith(LOCKED_EMAIL_SUFFIX),
    );
    const warnings = locked.length
      ? [
          `${locked.length} contact(s) skipped — their email hasn't been revealed yet, so they can't be emailed.`,
        ]
      : [];
    if (!confirmable.length) {
      return sendData(res, { confirmed: 0, scheduled: 0, warnings });
    }

    if (campaign.triggerType === "MANUAL") {
      let scheduled = 0;
      try {
        for (const row of confirmable) {
          scheduled += await enrolAndScheduleManualContact(campaign, row.contactId);
        }
      } catch (schedulerErr) {
        if (schedulerErr instanceof ManualSchedulerUnavailableError) {
          const code =
            schedulerErr.kind === "redis-quota"
              ? "REDIS_QUOTA_EXHAUSTED"
              : schedulerErr.kind === "redis-unavailable"
                ? "SCHEDULER_UNAVAILABLE"
                : "SCHEDULER_ERROR";
          return sendError(res, 503, code, schedulerErr.message);
        }
        throw schedulerErr;
      }
      return sendData(res, { confirmed: confirmable.length, scheduled, warnings });
    }

    // ETA campaigns: clear STAGED first — scheduleEtaTrigger below re-resolves
    // targets and holds anything still staged, so flipping status after would
    // leave the trigger ACTIVE with nothing scheduled and no retry.
    await prisma.campaignContact.updateMany({
      where: { campaignId: campaign.id, contactId: { in: confirmable.map((row) => row.contactId) } },
      data: { status: "PENDING", stagedAt: null, stagedReason: null },
    });

    // Backscan deliberately lives here rather than in the reconciler: creating
    // triggers at add-time would fire them against staged contacts, and the
    // trigger would never be re-scheduled after confirm.
    const vesselIds = Array.from(
      new Set(confirmable.map((row) => row.vesselId).filter((id): id is string => Boolean(id))),
    );
    let scheduled = 0;
    if (vesselIds.length) {
      const pendingEtas = await prisma.vesselETA.findMany({
        where: { vesselId: { in: vesselIds }, eta: { gt: new Date() } },
        select: { id: true },
      });
      for (const eta of pendingEtas) {
        try {
          const matches = await matchCampaignsToETA(eta.id);
          if (!matches.some((m) => m.autoEnroll && m.campaignId === campaign.id)) continue;
          // createETATriggers upserts and returns pre-existing rows, so an ETA
          // that already had a trigger still gets re-scheduled here.
          const triggers = await createETATriggers(eta.id, [campaign.id]);
          const results = await Promise.all(
            triggers.map((trigger) => scheduleEtaTrigger(trigger.id)),
          );
          scheduled += results.reduce((sum, result) => sum + result.scheduled, 0);
        } catch (err) {
          console.warn(
            `[campaign-staged-confirm] eta-backscan failed eta=${eta.id}: ${(err as Error).message}`,
          );
        }
      }
    }

    return sendData(res, { confirmed: confirmable.length, scheduled, warnings });
  } catch (error) {
    return next(error);
  }
});

campaignRouter.post("/:id/staged/dismiss", requireAuth, async (req, res, next) => {
  try {
    const input = stagedContactsSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, workspaceId },
      select: { id: true },
    });
    if (!campaign) return sendError(res, 404, "NOT_FOUND", "Campaign not found");

    // Deleted rather than marked dismissed: the row is the only thing keeping
    // these contacts out of the send paths, and a non-STAGED row would let the
    // workers' create-branch enrol them. They re-stage on the next list change,
    // which is honest — they're still a list-resolved candidate.
    const removed = await prisma.campaignContact.deleteMany({
      where: { campaignId: campaign.id, contactId: { in: input.data.contactIds }, status: "STAGED" },
    });

    return sendData(res, { dismissed: removed.count });
  } catch (error) {
    return next(error);
  }
});

const testSendSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(998),
  body: z.string().min(1).max(50_000),
});

/**
 * Sends a single ad-hoc email using the workspace's actual send pipeline —
 * JIT-provisions the platform inbox if needed, picks any ACTIVE/WARMING
 * mailbox, builds the same nodemailer / HTTP-API transport a campaign
 * would, and surfaces the same classified error. Lets users diagnose why
 * scheduled campaign sends are failing without having to launch one.
 */
/**
 * Send Step 1 immediately to every eligible target — bypasses BullMQ and
 * fires synchronously. Lets users push a campaign out right now (no waiting
 * for the configured schedule window) and surfaces per-contact reasons so
 * the send flow is debuggable without launching the normal scheduler.
 */
const sendNowSchema = z.object({
  contactIds: z.array(z.string().min(1)).optional(),
});

campaignRouter.post("/:id/send-now", requireAuth, async (req, res, next) => {
  try {
    const input = sendNowSchema.safeParse(req.body ?? {});
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!campaign) return sendError(res, 404, "NOT_FOUND", "Campaign not found");

    if (!(await workspaceHasSendingInbox(workspaceId))) {
      return sendError(res, 409, "NO_SENDING_INBOX", NO_SENDING_INBOX_MESSAGE);
    }

    if (campaign.status !== "ACTIVE") {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: "ACTIVE" },
      });
    }

    const result = await sendCampaignNow(campaign.id, input.data.contactIds);
    return sendData(res, result);
  } catch (error) {
    return next(error);
  }
});

/**
 * Returns the resolved sender that a /test-send (or campaign send) would use,
 * without actually sending. Lets the UI surface the From-address before the
 * user clicks so a domain-mismatch with the provider is obvious upfront.
 */
campaignRouter.get("/test-send/sender", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const inbox = await prisma.emailAccount.findFirst({
      where: {
        workspaceId,
        status: { in: ["ACTIVE", "WARMING"] },
        isPlatformDefault: false,
      },
      orderBy: { createdAt: "asc" },
    });
    if (!inbox) {
      return sendData(res, { ready: false });
    }
    const domain = (inbox.fromEmail ?? inbox.email).split("@")[1] ?? "";
    return sendData(res, {
      ready: true,
      provider: inbox.provider,
      fromEmail: inbox.fromEmail ?? inbox.email,
      fromName: inbox.fromName ?? inbox.displayName ?? null,
      platformDefault: inbox.isPlatformDefault,
      domain,
    });
  } catch (error) {
    return next(error);
  }
});

campaignRouter.post("/test-send", requireAuth, async (req, res, next) => {
  try {
    const input = testSendSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId } = (req as AuthedRequest).auth;

    const inbox = await prisma.emailAccount.findFirst({
      where: {
        workspaceId,
        status: { in: ["ACTIVE", "WARMING"] },
        isPlatformDefault: false,
      },
      orderBy: { createdAt: "asc" },
    });
    if (!inbox) {
      return sendError(
        res,
        409,
        "NO_SENDING_INBOX",
        "Connect an inbox in Settings → Inboxes before sending. Test sends must go from a mailbox you own.",
      );
    }

    try {
      const transport = await buildTransport(inbox);
      const result = await transport.sendMail({
        from: resolveFromAddress(inbox),
        to: input.data.to,
        subject: input.data.subject,
        text: input.data.body,
      });
      return sendData(res, {
        ok: true,
        messageId: result.messageId,
        to: input.data.to,
        sender: {
          provider: inbox.provider,
          fromEmail: inbox.fromEmail ?? inbox.email,
          platformDefault: inbox.isPlatformDefault,
        },
      });
    } catch (error) {
      console.error("[campaigns] test-send failed:", error);
      const { reason, hint } = classifyTransportError(error);
      return sendError(res, 400, "TEST_SEND_FAILED", `${reason}. ${hint}`);
    }
  } catch (error) {
    return next(error);
  }
});

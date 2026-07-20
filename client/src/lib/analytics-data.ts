import { notFound } from "next/navigation";
import { Prisma, prisma, type EmailEventType } from "@marimail/db";
import { getServerSession } from "@/lib/api";

const HOT_EVENTS: EmailEventType[] = ["OPENED", "CLICKED", "REPLIED"];

export async function requireAnalyticsWorkspace() {
  const session = await getServerSession();
  if (!session?.activeWorkspace) notFound();
  return { workspaceId: session.activeWorkspace.id, userId: session.user.id, workspace: session.activeWorkspace };
}

function rate(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function trend(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export async function getOverview(workspaceId: string, days = 30) {
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const startWeek = new Date(now);
  startWeek.setUTCHours(0, 0, 0, 0);
  const endWeek = new Date(startWeek.getTime() + 7 * 86_400_000);
  const in48h = new Date(now.getTime() + 48 * 3_600_000);
  const startRecent = new Date(now.getTime() - days * 86_400_000);
  const startPrevious = new Date(startRecent.getTime() - days * 86_400_000);

  try {
    const [
      vesselsThisMonth,
      vesselsLastMonth,
      weekEtas,
      activeCampaigns,
      newCampaigns,
      sentRecent,
      sentPrevious,
      repliesRecent,
      repliesPrevious,
      missed,
    ] = await Promise.all([
      // Include workspace-owned + global (admin-authored) ETAs so per-
      // workspace analytics don't zero out when ETAs are shared across
      // workspaces.
      prisma.vesselETA.count({ where: { OR: [{ workspaceId }, { workspaceId: null }], createdAt: { gte: startMonth } } }),
      prisma.vesselETA.count({ where: { OR: [{ workspaceId }, { workspaceId: null }], createdAt: { gte: startLastMonth, lte: endLastMonth } } }),
      prisma.vesselETA.findMany({
        where: { OR: [{ workspaceId }, { workspaceId: null }], eta: { gte: startWeek, lt: endWeek } },
        select: { port: { select: { region: true } } },
      }),
      prisma.campaign.count({ where: { workspaceId, status: "ACTIVE" } }),
      prisma.campaign.count({ where: { workspaceId, createdAt: { gte: startMonth } } }),
      prisma.emailEvent.count({ where: { workspaceId, eventType: "SENT", occurredAt: { gte: startRecent } } }),
      prisma.emailEvent.count({ where: { workspaceId, eventType: "SENT", occurredAt: { gte: startPrevious, lt: startRecent } } }),
      prisma.emailEvent.count({ where: { workspaceId, eventType: "REPLIED", occurredAt: { gte: startRecent } } }),
      prisma.emailEvent.count({ where: { workspaceId, eventType: "REPLIED", occurredAt: { gte: startPrevious, lt: startRecent } } }),
      prisma.vesselETA.count({ where: { OR: [{ workspaceId }, { workspaceId: null }], eta: { gte: now, lte: in48h }, triggers: { none: {} } } }),
    ]);

    const regions: Record<string, number> = {};
    for (const eta of weekEtas) {
      const region = eta.port?.region ?? "UNKNOWN";
      regions[region] = (regions[region] ?? 0) + 1;
    }

    const sparkline = await prisma.$queryRaw<Array<{ day: Date; sent: bigint; replied: bigint }>>`
      SELECT date_trunc('day', "occurredAt") AS day,
             COUNT(*) FILTER (WHERE "eventType" = 'SENT') AS sent,
             COUNT(*) FILTER (WHERE "eventType" = 'REPLIED') AS replied
      FROM "EmailEvent"
      WHERE "workspaceId" = ${workspaceId}
        AND "occurredAt" >= ${startRecent}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return {
      range: { days },
      cards: {
        vesselsTracked: { value: vesselsThisMonth, trend: trend(vesselsThisMonth, vesselsLastMonth) },
        etasThisWeek: { value: weekEtas.length, byRegion: regions },
        activeCampaigns: { value: activeCampaigns, newThisMonth: newCampaigns },
        emailsSent: { value: sentRecent, trend: trend(sentRecent, sentPrevious) },
        avgReplyRate: { value: rate(repliesRecent, sentRecent), trend: trend(rate(repliesRecent, sentRecent), rate(repliesPrevious, sentPrevious)) },
        missedOpportunities: { value: missed },
      },
      sparkline: sparkline.map((row) => ({ day: row.day.toISOString().slice(0, 10), sent: Number(row.sent), replied: Number(row.replied) })),
    };
  } catch (err) {
    console.error("[analytics] getOverview failed:", err);
    return {
      range: { days },
      cards: {
        vesselsTracked: { value: 0, trend: 0 },
        etasThisWeek: { value: 0, byRegion: {} },
        activeCampaigns: { value: 0, newThisMonth: 0 },
        emailsSent: { value: 0, trend: 0 },
        avgReplyRate: { value: 0, trend: 0 },
        missedOpportunities: { value: 0 },
      },
      sparkline: [] as Array<{ day: string; sent: number; replied: number }>,
    };
  }
}

export type AnalyticsOverview = Awaited<ReturnType<typeof getOverview>>;

export async function getPortAnalytics(workspaceId: string) {
  try {
  const rows = await prisma.$queryRaw<Array<{ portCode: string; portName: string | null; sent: bigint; opened: bigint; replied: bigint; campaigns: bigint }>>`
    SELECT eta."destinationPort" AS "portCode",
           p."portName",
           COUNT(*) FILTER (WHERE e."eventType" = 'SENT') AS sent,
           COUNT(*) FILTER (WHERE e."eventType" = 'OPENED') AS opened,
           COUNT(*) FILTER (WHERE e."eventType" = 'REPLIED') AS replied,
           COUNT(DISTINCT t."campaignId") FILTER (WHERE t.status IN ('PENDING','ACTIVE')) AS campaigns
    FROM "VesselETA" eta
    LEFT JOIN "Port" p ON p."portCode" = eta."destinationPort"
    LEFT JOIN "ETATrigger" t ON t."vesselEtaId" = eta.id
    LEFT JOIN "CampaignContact" cc ON cc."etaTriggerId" = t.id
    LEFT JOIN "EmailEvent" e ON e."campaignContactId" = cc.id AND e."workspaceId" = eta."workspaceId"
    WHERE eta."workspaceId" = ${workspaceId}
    GROUP BY eta."destinationPort", p."portName"
    ORDER BY replied DESC, sent DESC
  `;

  const stepBest = await prisma.$queryRaw<Array<{ delayValue: number; sent: bigint; replied: bigint }>>`
    SELECT s."delayValue",
           COUNT(*) FILTER (WHERE e."eventType" = 'SENT') AS sent,
           COUNT(*) FILTER (WHERE e."eventType" = 'REPLIED') AS replied
    FROM "EmailEvent" e
    JOIN "CampaignSequence" s ON s.id = e."sequenceId"
    WHERE e."workspaceId" = ${workspaceId} AND s."delayType" = 'DAYS_BEFORE_ETA'
    GROUP BY s."delayValue"
    ORDER BY s."delayValue" DESC
  `;

  const heatRows = await prisma.$queryRaw<Array<{ portCode: string; vesselType: string; sent: bigint; replied: bigint }>>`
    SELECT eta."destinationPort" AS "portCode", v."vesselType"::text AS "vesselType",
           COUNT(*) FILTER (WHERE e."eventType" = 'SENT') AS sent,
           COUNT(*) FILTER (WHERE e."eventType" = 'REPLIED') AS replied
    FROM "EmailEvent" e
    JOIN "CampaignContact" cc ON cc.id = e."campaignContactId"
    JOIN "Vessel" v ON v.id = cc."vesselId"
    JOIN "ETATrigger" t ON t.id = cc."etaTriggerId"
    JOIN "VesselETA" eta ON eta.id = t."vesselEtaId"
    WHERE e."workspaceId" = ${workspaceId}
    GROUP BY eta."destinationPort", v."vesselType"
  `;

  return {
    ports: rows.map((row) => {
      const sent = Number(row.sent);
      const opened = Number(row.opened);
      const replied = Number(row.replied);
      return {
        portCode: row.portCode,
        portName: row.portName ?? row.portCode,
        sent,
        opened,
        replied,
        campaigns: Number(row.campaigns),
        openRate: rate(opened, sent),
        replyRate: rate(replied, sent),
      };
    }),
    bestStep: stepBest.map((row) => ({
      daysBefore: row.delayValue,
      sent: Number(row.sent),
      replied: Number(row.replied),
      replyRate: rate(Number(row.replied), Number(row.sent)),
    })),
    heatmap: heatRows.map((row) => ({
      portCode: row.portCode,
      vesselType: row.vesselType,
      sent: Number(row.sent),
      replied: Number(row.replied),
      replyRate: rate(Number(row.replied), Number(row.sent)),
    })),
  };
  } catch (err) {
    console.error("[analytics] getPortAnalytics failed:", err);
    return { ports: [], bestStep: [], heatmap: [] };
  }
}

export async function getOperatorAnalytics(workspaceId: string) {
  try {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);
  const top = await prisma.$queryRaw<Array<{ companyName: string; sent: bigint; opened: bigint; replied: bigint }>>`
    SELECT c."companyName",
           COUNT(*) FILTER (WHERE e."eventType" = 'SENT') AS sent,
           COUNT(*) FILTER (WHERE e."eventType" = 'OPENED') AS opened,
           COUNT(*) FILTER (WHERE e."eventType" = 'REPLIED') AS replied
    FROM "EmailEvent" e
    JOIN "Contact" c ON c.id = e."contactId"
    WHERE e."workspaceId" = ${workspaceId}
    GROUP BY c."companyName"
    ORDER BY replied DESC, opened DESC
    LIMIT 20
  `;

  const dead = await prisma.$queryRaw<Array<{ companyName: string; sent: bigint; opens: bigint }>>`
    SELECT c."companyName",
           COUNT(*) FILTER (WHERE e."eventType" = 'SENT') AS sent,
           COUNT(*) FILTER (WHERE e."eventType" = 'OPENED' AND e."occurredAt" >= ${ninetyDaysAgo}) AS opens
    FROM "EmailEvent" e
    JOIN "Contact" c ON c.id = e."contactId"
    WHERE e."workspaceId" = ${workspaceId}
    GROUP BY c."companyName"
    HAVING COUNT(*) FILTER (WHERE e."eventType" = 'SENT') > 10
       AND COUNT(*) FILTER (WHERE e."eventType" = 'OPENED' AND e."occurredAt" >= ${ninetyDaysAgo}) = 0
    ORDER BY sent DESC
    LIMIT 20
  `;

  const activity = await prisma.emailEvent.findMany({
    where: { workspaceId, eventType: { in: HOT_EVENTS }, occurredAt: { gte: new Date(Date.now() - 7 * 86_400_000) } },
    orderBy: { occurredAt: "desc" },
    take: 20,
    select: {
      occurredAt: true,
      eventType: true,
      contact: { select: { firstName: true, lastName: true, companyName: true } },
      campaign: { select: { name: true } },
    },
  });

  const etaConversion = await prisma.$queryRaw<Array<{ portCode: string; vesselType: string; previousCargo: string | null; nextCargo: string | null; triggered: bigint; replied: bigint }>>`
    SELECT eta."destinationPort" AS "portCode", v."vesselType"::text AS "vesselType",
           eta."previousCargo", eta."nextCargo",
           COUNT(DISTINCT t.id) AS triggered,
           COUNT(*) FILTER (WHERE e."eventType" = 'REPLIED') AS replied
    FROM "VesselETA" eta
    JOIN "Vessel" v ON v.id = eta."vesselId"
    LEFT JOIN "ETATrigger" t ON t."vesselEtaId" = eta.id
    LEFT JOIN "CampaignContact" cc ON cc."etaTriggerId" = t.id
    LEFT JOIN "EmailEvent" e ON e."campaignContactId" = cc.id
    WHERE eta."workspaceId" = ${workspaceId}
    GROUP BY eta."destinationPort", v."vesselType", eta."previousCargo", eta."nextCargo"
    ORDER BY replied DESC, triggered DESC
    LIMIT 25
  `;

  return {
    topCompanies: top.map((row) => ({
      companyName: row.companyName,
      sent: Number(row.sent),
      opened: Number(row.opened),
      replied: Number(row.replied),
      openRate: rate(Number(row.opened), Number(row.sent)),
      replyRate: rate(Number(row.replied), Number(row.sent)),
    })),
    deadOperators: dead.map((row) => ({ companyName: row.companyName, sent: Number(row.sent), opens: Number(row.opens) })),
    activity: activity.map((entry) => ({
      occurredAt: entry.occurredAt,
      eventType: entry.eventType,
      contact: entry.contact ? `${entry.contact.firstName} ${entry.contact.lastName}` : "Unknown",
      company: entry.contact?.companyName ?? "Unknown",
      campaign: entry.campaign?.name ?? "Unknown",
    })),
    etaConversion: etaConversion.map((row) => ({
      portCode: row.portCode,
      vesselType: row.vesselType,
      previousCargo: row.previousCargo,
      nextCargo: row.nextCargo,
      triggered: Number(row.triggered),
      replied: Number(row.replied),
      replyRate: rate(Number(row.replied), Number(row.triggered)),
    })),
  };
  } catch (err) {
    console.error("[analytics] getOperatorAnalytics failed:", err);
    return { topCompanies: [], deadOperators: [], activity: [], etaConversion: [] };
  }
}

export async function getCampaignAnalytics(workspaceId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId },
    include: { sequences: { orderBy: { stepOrder: "asc" } } },
  });
  if (!campaign) return null;

  const events = await prisma.emailEvent.groupBy({
    by: ["eventType"],
    where: { workspaceId, campaignId },
    _count: { _all: true },
  });
  const counts = new Map<EmailEventType, number>();
  for (const event of events) counts.set(event.eventType, event._count._all);

  const sent = counts.get("SENT") ?? 0;
  const opened = counts.get("OPENED") ?? 0;
  const clicked = counts.get("CLICKED") ?? 0;
  const replied = counts.get("REPLIED") ?? 0;
  const bounced = (counts.get("BOUNCED_HARD") ?? 0) + (counts.get("BOUNCED_SOFT") ?? 0);
  const unsub = counts.get("UNSUBSCRIBED") ?? 0;

  const stepEvents = await prisma.emailEvent.groupBy({
    by: ["sequenceId", "eventType"],
    where: { workspaceId, campaignId, sequenceId: { not: null } },
    _count: { _all: true },
  });
  const stepMap = new Map<string, { sent: number; opened: number; clicked: number; replied: number }>();
  for (const row of stepEvents) {
    if (!row.sequenceId) continue;
    const bucket = stepMap.get(row.sequenceId) ?? { sent: 0, opened: 0, clicked: 0, replied: 0 };
    if (row.eventType === "SENT") bucket.sent += row._count._all;
    if (row.eventType === "OPENED") bucket.opened += row._count._all;
    if (row.eventType === "CLICKED") bucket.clicked += row._count._all;
    if (row.eventType === "REPLIED") bucket.replied += row._count._all;
    stepMap.set(row.sequenceId, bucket);
  }

  const steps = campaign.sequences.map((sequence) => {
    const stats = stepMap.get(sequence.id) ?? { sent: 0, opened: 0, clicked: 0, replied: 0 };
    return {
      id: sequence.id,
      stepOrder: sequence.stepOrder,
      subject: sequence.subject,
      delayValue: sequence.delayValue,
      delayType: sequence.delayType,
      sent: stats.sent,
      openRate: rate(stats.opened, stats.sent),
      clickRate: rate(stats.clicked, stats.sent),
      replyRate: rate(stats.replied, stats.sent),
    };
  });

  const perVesselRows = await prisma.$queryRaw<Array<{ imoNumber: string; vesselName: string; sent: bigint; replied: bigint }>>`
    SELECT v."imoNumber", v."vesselName",
           COUNT(*) FILTER (WHERE e."eventType" = 'SENT') AS sent,
           COUNT(*) FILTER (WHERE e."eventType" = 'REPLIED') AS replied
    FROM "EmailEvent" e
    JOIN "CampaignContact" cc ON cc.id = e."campaignContactId"
    JOIN "Vessel" v ON v.id = cc."vesselId"
    WHERE e."workspaceId" = ${workspaceId} AND e."campaignId" = ${campaignId}
    GROUP BY v."imoNumber", v."vesselName"
    ORDER BY replied DESC, sent DESC
    LIMIT 50
  `;

  return {
    campaign: { id: campaign.id, name: campaign.name, status: campaign.status, triggerType: campaign.triggerType },
    funnel: {
      sent,
      opened,
      clicked,
      replied,
      bounced,
      unsubscribed: unsub,
      openRate: rate(opened, sent),
      clickRate: rate(clicked, sent),
      replyRate: rate(replied, sent),
      bounceRate: rate(bounced, sent),
    },
    steps,
    perVessel: perVesselRows.map((row) => ({
      imoNumber: row.imoNumber,
      vesselName: row.vesselName,
      sent: Number(row.sent),
      replied: Number(row.replied),
      replyRate: rate(Number(row.replied), Number(row.sent)),
    })),
  };
}

type StepFireTime = { stepOrder: number; delayValue: number; fireAt: string };

function parseStepFireTimes(value: unknown): StepFireTime[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StepFireTime => {
    if (!item || typeof item !== "object") return false;
    const e = item as Record<string, unknown>;
    return typeof e.stepOrder === "number" && typeof e.fireAt === "string";
  });
}

export type ScheduleStepStatus = "SENT" | "SCHEDULED" | "SKIPPED" | "PENDING" | "FAILED" | "BOUNCED";

/**
 * Per-recipient, per-step delivery schedule for a campaign — "who gets which
 * mail, and when". For ETA campaigns the scheduled time comes from the
 * ETATrigger's stepFireTimes (ETA − N days per step); actual sends come from
 * the SENT EmailEvent. This is the source the analytics "Delivery schedule"
 * section renders.
 */
export async function getCampaignSchedule(workspaceId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId },
    include: { sequences: { orderBy: { stepOrder: "asc" } } },
  });
  if (!campaign) return null;

  const isEta = campaign.triggerType !== "MANUAL";

  const campaignContacts = await prisma.campaignContact.findMany({
    where: { campaignId, workspaceId },
    include: {
      contact: { select: { firstName: true, lastName: true, email: true, companyName: true } },
      vessel: { select: { vesselName: true, imoNumber: true } },
      etaTrigger: {
        select: {
          stepFireTimes: true,
          vesselEta: { select: { eta: true, destinationPortName: true, destinationPort: true } },
        },
      },
      events: {
        select: { sequenceId: true, eventType: true, occurredAt: true, metadata: true },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  const now = Date.now();

  const recipients = campaignContacts.map((cc) => {
    const fireTimes = parseStepFireTimes(cc.etaTrigger?.stepFireTimes);
    const eta = cc.etaTrigger?.vesselEta?.eta ?? null;
    const etaPort =
      cc.etaTrigger?.vesselEta?.destinationPortName ||
      cc.etaTrigger?.vesselEta?.destinationPort ||
      null;

    // Index this contact's events by sequenceId for quick per-step lookup.
    const eventsByStep = new Map<string, typeof cc.events>();
    for (const ev of cc.events) {
      if (!ev.sequenceId) continue;
      const arr = eventsByStep.get(ev.sequenceId) ?? [];
      arr.push(ev);
      eventsByStep.set(ev.sequenceId, arr);
    }

    const steps = campaign.sequences.map((sequence) => {
      const evs = eventsByStep.get(sequence.id) ?? [];
      const sentEvent = evs.find((e) => e.eventType === "SENT");
      const failedEvent = evs.find((e) => e.eventType === "FAILED");
      const bouncedEvent = evs.find((e) => e.eventType === "BOUNCED_HARD" || e.eventType === "BOUNCED_SOFT");

      // Scheduled fire time: ETA campaigns use the trigger's per-step fire time;
      // manual campaigns only know the *next* step time (nextSendAt).
      const fire = fireTimes.find((f) => f.stepOrder === sequence.stepOrder);
      const scheduledIso =
        fire?.fireAt ??
        (cc.sequenceId === sequence.id && cc.nextSendAt ? cc.nextSendAt.toISOString() : null);

      let status: ScheduleStepStatus;
      let at: string | null;
      if (sentEvent) {
        status = "SENT";
        at = sentEvent.occurredAt.toISOString();
      } else if (bouncedEvent) {
        status = "BOUNCED";
        at = bouncedEvent.occurredAt.toISOString();
      } else if (failedEvent) {
        status = "FAILED";
        at = failedEvent.occurredAt.toISOString();
      } else if (scheduledIso) {
        const t = new Date(scheduledIso).getTime();
        // A past-due ETA step that never sent means its days-before window
        // elapsed before launch — the scheduler skips it (see campaign-scheduler).
        status = t > now ? "SCHEDULED" : isEta ? "SKIPPED" : "PENDING";
        at = scheduledIso;
      } else {
        status = "PENDING";
        at = null;
      }

      return {
        stepOrder: sequence.stepOrder,
        subject: sequence.subject,
        delayType: sequence.delayType,
        delayValue: sequence.delayValue,
        status,
        at,
      };
    });

    const name = `${cc.contact.firstName} ${cc.contact.lastName}`.trim() || cc.contact.email;
    return {
      campaignContactId: cc.id,
      contactId: cc.contactId,
      name,
      email: cc.contact.email,
      companyName: cc.contact.companyName,
      vesselName: cc.vessel?.vesselName ?? null,
      imoNumber: cc.vessel?.imoNumber ?? null,
      eta: eta ? eta.toISOString() : null,
      etaPort,
      status: cc.status as string,
      steps,
    };
  });

  return {
    isEta,
    triggerType: campaign.triggerType,
    recipients,
    sequenceCount: campaign.sequences.length,
  };
}

export type CampaignScheduleData = NonNullable<Awaited<ReturnType<typeof getCampaignSchedule>>>;

export async function getVesselCrm(workspaceId: string, imoNumber: string) {
  const vessel = await prisma.vessel.findFirst({
    where: { imoNumber, workspaceId },
    include: {
      shipOwnerCompany: true,
      ismManagerCompany: true,
      commercialManagerCompany: true,
      etas: { orderBy: { eta: "desc" }, take: 12 },
      serviceRecords: { orderBy: { serviceDate: "desc" } },
    },
  });
  if (!vessel) return null;

  const events = await prisma.emailEvent.findMany({
    where: { workspaceId, campaignContact: { vesselId: vessel.id } },
    orderBy: { occurredAt: "desc" },
    take: 50,
    include: {
      contact: { select: { firstName: true, lastName: true, email: true, companyName: true } },
      campaign: { select: { id: true, name: true } },
      sequence: { select: { id: true, stepOrder: true, subject: true } },
    },
  });

  const totals = await prisma.emailEvent.groupBy({
    by: ["eventType"],
    where: { workspaceId, campaignContact: { vesselId: vessel.id } },
    _count: { _all: true },
  });
  const totalsMap: Record<string, number> = {};
  for (const row of totals) totalsMap[row.eventType] = row._count._all;

  const lastSent = await prisma.emailEvent.findFirst({
    where: { workspaceId, campaignContact: { vesselId: vessel.id }, eventType: "SENT" },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });

  return {
    vessel,
    services: vessel.serviceRecords,
    timeline: events,
    totals: totalsMap,
    lastContactedAt: lastSent?.occurredAt ?? null,
    timesContacted: totalsMap.SENT ?? 0,
  };
}

export async function listWorkspaceCampaigns(workspaceId: string) {
  try {
    return await prisma.campaign.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        triggerType: true,
        _count: { select: { emailEvents: true, contacts: true, etaTriggers: true } },
      },
    });
  } catch (err) {
    console.error("[analytics] listWorkspaceCampaigns failed:", err);
    return [];
  }
}

export function formatRate(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

export function formatTrend(value: number) {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export const _unused: Prisma.VesselWhereInput = {};

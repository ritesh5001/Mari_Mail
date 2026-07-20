import { prisma, type EmailEventType } from "@marimail/db";

const HOT_EVENTS: EmailEventType[] = ["OPENED", "CLICKED", "REPLIED"];

function rangeFromNow(days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  return { start, end };
}

function rangeBefore(days: number, lookback: number) {
  const end = new Date(Date.now() - days * 86_400_000);
  const start = new Date(end.getTime() - lookback * 86_400_000);
  return { start, end };
}

function rate(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function trend(current: number, previous: number) {
  if (!previous) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

export async function getOverviewKpis(workspaceId: string, days = 30) {
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const startWeek = new Date(now);
  startWeek.setUTCHours(0, 0, 0, 0);
  const endWeek = new Date(startWeek.getTime() + 7 * 86_400_000);
  const in48h = new Date(now.getTime() + 48 * 3_600_000);

  const recentRange = rangeFromNow(days);
  const previousRange = rangeBefore(days, days);

  const [
    vesselsThisMonth,
    vesselsLastMonth,
    etasWeek,
    activeCampaigns,
    newCampaignsThisMonth,
    sentRecent,
    sentPrevious,
    repliesRecent,
    repliesPrevious,
    missed,
    etasByRegion,
  ] = await Promise.all([
    // ETA counts include workspace-owned + global admin-authored rows so
    // widening a shared "global ETA" doesn't zero out per-workspace numbers.
    prisma.vesselETA.count({ where: { OR: [{ workspaceId }, { workspaceId: null }], createdAt: { gte: startMonth } } }),
    prisma.vesselETA.count({ where: { OR: [{ workspaceId }, { workspaceId: null }], createdAt: { gte: startLastMonth, lte: endLastMonth } } }),
    prisma.vesselETA.findMany({
      where: { OR: [{ workspaceId }, { workspaceId: null }], eta: { gte: startWeek, lt: endWeek } },
      select: { id: true, port: { select: { region: true } } },
    }),
    prisma.campaign.count({ where: { workspaceId, status: "ACTIVE" } }),
    prisma.campaign.count({ where: { workspaceId, createdAt: { gte: startMonth } } }),
    prisma.emailEvent.count({ where: { workspaceId, eventType: "SENT", occurredAt: { gte: recentRange.start, lt: recentRange.end } } }),
    prisma.emailEvent.count({ where: { workspaceId, eventType: "SENT", occurredAt: { gte: previousRange.start, lt: previousRange.end } } }),
    prisma.emailEvent.count({ where: { workspaceId, eventType: "REPLIED", occurredAt: { gte: recentRange.start, lt: recentRange.end } } }),
    prisma.emailEvent.count({ where: { workspaceId, eventType: "REPLIED", occurredAt: { gte: previousRange.start, lt: previousRange.end } } }),
    prisma.vesselETA.count({ where: { OR: [{ workspaceId }, { workspaceId: null }], eta: { gte: now, lte: in48h }, triggers: { none: {} } } }),
    prisma.vesselETA.findMany({
      where: { OR: [{ workspaceId }, { workspaceId: null }], eta: { gte: startWeek, lt: endWeek } },
      select: { port: { select: { region: true } } },
    }),
  ]);

  const regionCounts: Record<string, number> = {};
  for (const eta of etasByRegion) {
    const key = eta.port?.region ?? "UNKNOWN";
    regionCounts[key] = (regionCounts[key] ?? 0) + 1;
  }

  const sparkline = await sentSparkline(workspaceId, days);

  return {
    range: { days, recent: recentRange, previous: previousRange },
    cards: {
      vesselsTracked: { value: vesselsThisMonth, trend: trend(vesselsThisMonth, vesselsLastMonth) },
      etasThisWeek: { value: etasWeek.length, byRegion: regionCounts },
      activeCampaigns: { value: activeCampaigns, newThisMonth: newCampaignsThisMonth },
      emailsSent: { value: sentRecent, trend: trend(sentRecent, sentPrevious) },
      avgReplyRate: { value: rate(repliesRecent, sentRecent), trend: trend(rate(repliesRecent, sentRecent), rate(repliesPrevious, sentPrevious)) },
      missedOpportunities: { value: missed },
    },
    sparkline,
  };
}

async function sentSparkline(workspaceId: string, days: number) {
  const start = new Date(Date.now() - days * 86_400_000);
  start.setUTCHours(0, 0, 0, 0);
  const rows = await prisma.$queryRaw<Array<{ day: Date; sent: bigint; replied: bigint }>>`
    SELECT date_trunc('day', "occurredAt") AS day,
           COUNT(*) FILTER (WHERE "eventType" = 'SENT') AS sent,
           COUNT(*) FILTER (WHERE "eventType" = 'REPLIED') AS replied
    FROM "EmailEvent"
    WHERE "workspaceId" = ${workspaceId}
      AND "occurredAt" >= ${start}
    GROUP BY 1
    ORDER BY 1 ASC
  `;
  return rows.map((row) => ({ day: row.day.toISOString().slice(0, 10), sent: Number(row.sent), replied: Number(row.replied) }));
}

export async function getCampaignFunnel(workspaceId: string, campaignId: string) {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, workspaceId },
    include: {
      sequences: { orderBy: { stepOrder: "asc" } },
    },
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
  const bouncedHard = counts.get("BOUNCED_HARD") ?? 0;
  const bouncedSoft = counts.get("BOUNCED_SOFT") ?? 0;
  const unsub = counts.get("UNSUBSCRIBED") ?? 0;

  const stepStats = await prisma.emailEvent.groupBy({
    by: ["sequenceId", "eventType"],
    where: { workspaceId, campaignId, sequenceId: { not: null } },
    _count: { _all: true },
  });

  const stepMap = new Map<string, { sent: number; opened: number; clicked: number; replied: number }>();
  for (const row of stepStats) {
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

  const vesselRows = await prisma.$queryRaw<Array<{ vesselId: string; vesselName: string; imoNumber: string; sent: bigint; replied: bigint }>>`
    SELECT v.id AS "vesselId", v."vesselName", v."imoNumber",
           COUNT(*) FILTER (WHERE e."eventType" = 'SENT') AS sent,
           COUNT(*) FILTER (WHERE e."eventType" = 'REPLIED') AS replied
    FROM "EmailEvent" e
    JOIN "CampaignContact" cc ON cc.id = e."campaignContactId"
    LEFT JOIN "Vessel" v ON v.id = cc."vesselId"
    WHERE e."workspaceId" = ${workspaceId}
      AND e."campaignId" = ${campaignId}
      AND v.id IS NOT NULL
    GROUP BY v.id, v."vesselName", v."imoNumber"
    ORDER BY replied DESC, sent DESC
    LIMIT 50
  `;

  const perVessel = vesselRows.map((row) => ({
    vesselId: row.vesselId,
    vesselName: row.vesselName,
    imoNumber: row.imoNumber,
    sent: Number(row.sent),
    replied: Number(row.replied),
    replyRate: rate(Number(row.replied), Number(row.sent)),
  }));

  const inboxRows = await prisma.$queryRaw<Array<{ accountId: string; email: string; sent: bigint; replied: bigint }>>`
    SELECT a.id AS "accountId", a.email,
           COUNT(*) FILTER (WHERE e."eventType" = 'SENT') AS sent,
           COUNT(*) FILTER (WHERE e."eventType" = 'REPLIED') AS replied
    FROM "EmailEvent" e
    JOIN "CampaignContact" cc ON cc.id = e."campaignContactId"
    LEFT JOIN "EmailAccount" a ON a.id = (e.metadata->>'accountId')
    WHERE e."workspaceId" = ${workspaceId}
      AND e."campaignId" = ${campaignId}
      AND a.id IS NOT NULL
    GROUP BY a.id, a.email
    ORDER BY replied DESC, sent DESC
    LIMIT 10
  `;

  return {
    campaign: { id: campaign.id, name: campaign.name, status: campaign.status, triggerType: campaign.triggerType },
    funnel: {
      sent,
      opened,
      clicked,
      replied,
      bounced: bouncedHard + bouncedSoft,
      unsubscribed: unsub,
      openRate: rate(opened, sent),
      clickRate: rate(clicked, sent),
      replyRate: rate(replied, sent),
      bounceRate: rate(bouncedHard + bouncedSoft, sent),
    },
    steps,
    perVessel,
    topInboxes: inboxRows.map((row) => ({
      accountId: row.accountId,
      email: row.email,
      sent: Number(row.sent),
      replied: Number(row.replied),
      replyRate: rate(Number(row.replied), Number(row.sent)),
    })),
  };
}

export async function getPortPerformance(workspaceId: string) {
  const rows = await prisma.$queryRaw<Array<{ portCode: string; portName: string | null; sent: bigint; opened: bigint; replied: bigint; campaigns: bigint }>>`
    SELECT eta."destinationPort" AS "portCode",
           p."portName",
           COUNT(*) FILTER (WHERE e."eventType" = 'SENT') AS sent,
           COUNT(*) FILTER (WHERE e."eventType" = 'OPENED') AS opened,
           COUNT(*) FILTER (WHERE e."eventType" = 'REPLIED') AS replied,
           COUNT(DISTINCT t."campaignId") FILTER (WHERE t.status IN ('PENDING', 'ACTIVE')) AS campaigns
    FROM "VesselETA" eta
    LEFT JOIN "Port" p ON p."portCode" = eta."destinationPort"
    LEFT JOIN "ETATrigger" t ON t."vesselEtaId" = eta.id
    LEFT JOIN "CampaignContact" cc ON cc."etaTriggerId" = t.id
    LEFT JOIN "EmailEvent" e ON e."campaignContactId" = cc.id AND e."workspaceId" = eta."workspaceId"
    WHERE eta."workspaceId" = ${workspaceId}
    GROUP BY eta."destinationPort", p."portName"
    ORDER BY replied DESC, sent DESC
  `;

  const ports = rows.map((row) => {
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
  });

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

  const bestStep = stepBest.map((row) => ({
    daysBefore: row.delayValue,
    sent: Number(row.sent),
    replied: Number(row.replied),
    replyRate: rate(Number(row.replied), Number(row.sent)),
  }));

  const heatRows = await prisma.$queryRaw<Array<{ portCode: string; vesselType: string; sent: bigint; replied: bigint }>>`
    SELECT eta."destinationPort" AS "portCode", v."vesselType"::text AS "vesselType",
           COUNT(*) FILTER (WHERE e."eventType" = 'SENT') AS sent,
           COUNT(*) FILTER (WHERE e."eventType" = 'REPLIED') AS replied
    FROM "EmailEvent" e
    JOIN "CampaignContact" cc ON cc.id = e."campaignContactId"
    JOIN "Vessel" v ON v.id = cc."vesselId"
    JOIN "VesselETA" eta ON eta.id IN (SELECT "vesselEtaId" FROM "ETATrigger" WHERE id = cc."etaTriggerId")
    WHERE e."workspaceId" = ${workspaceId}
    GROUP BY eta."destinationPort", v."vesselType"
  `;

  const heatmap = heatRows.map((row) => ({
    portCode: row.portCode,
    vesselType: row.vesselType,
    sent: Number(row.sent),
    replied: Number(row.replied),
    replyRate: rate(Number(row.replied), Number(row.sent)),
  }));

  return { ports, bestStep, heatmap };
}

export async function getOperatorIntelligence(workspaceId: string) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000);

  const topCompanies = await prisma.$queryRaw<Array<{ companyName: string; sent: bigint; opened: bigint; replied: bigint }>>`
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

  const top = topCompanies.map((row) => ({
    companyName: row.companyName,
    sent: Number(row.sent),
    opened: Number(row.opened),
    replied: Number(row.replied),
    openRate: rate(Number(row.opened), Number(row.sent)),
    replyRate: rate(Number(row.replied), Number(row.sent)),
  }));

  const deadOperators = await prisma.$queryRaw<Array<{ companyName: string; sent: bigint; opens: bigint }>>`
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
    topCompanies: top,
    deadOperators: deadOperators.map((row) => ({ companyName: row.companyName, sent: Number(row.sent), opens: Number(row.opens) })),
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
}

export async function getVesselCrmHistory(workspaceId: string, imoNumber: string) {
  const vessel = await prisma.vessel.findFirst({
    where: { imoNumber, workspaceId },
    include: {
      shipOwnerCompany: { select: { id: true, companyName: true } },
      ismManagerCompany: { select: { id: true, companyName: true } },
      commercialManagerCompany: { select: { id: true, companyName: true } },
      etas: { orderBy: { eta: "desc" }, take: 20, select: { id: true, eta: true, destinationPort: true, destinationPortName: true } },
    },
  });
  if (!vessel) return null;

  const events = await prisma.emailEvent.findMany({
    where: {
      workspaceId,
      campaignContact: { vesselId: vessel.id },
    },
    orderBy: { occurredAt: "desc" },
    take: 100,
    include: {
      contact: { select: { firstName: true, lastName: true, email: true, companyName: true } },
      campaign: { select: { id: true, name: true } },
      sequence: { select: { id: true, stepOrder: true, subject: true } },
    },
  });

  const services = await prisma.serviceRecord.findMany({
    where: { workspaceId, vesselId: vessel.id },
    orderBy: { serviceDate: "desc" },
  });

  const summary = await prisma.emailEvent.groupBy({
    by: ["eventType"],
    where: { workspaceId, campaignContact: { vesselId: vessel.id } },
    _count: { _all: true },
  });

  const totals: Record<string, number> = {};
  for (const row of summary) totals[row.eventType] = row._count._all;

  const lastSent = await prisma.emailEvent.findFirst({
    where: { workspaceId, campaignContact: { vesselId: vessel.id }, eventType: "SENT" },
    orderBy: { occurredAt: "desc" },
    select: { occurredAt: true },
  });

  return {
    vessel,
    services,
    timeline: events,
    totals,
    lastContactedAt: lastSent?.occurredAt ?? null,
    timesContacted: totals.SENT ?? 0,
  };
}

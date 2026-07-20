import { prisma, type EmailEventType } from "@marimail/db";

const EVENT_WEIGHTS: Partial<Record<EmailEventType, { score: number; cap: number }>> = {
  OPENED: { score: 5, cap: 15 },
  CLICKED: { score: 10, cap: 20 },
  REPLIED: { score: 25, cap: 100 },
  UNSUBSCRIBED: { score: -30, cap: -30 },
  BOUNCED_HARD: { score: -40, cap: -40 },
  SPAM: { score: -50, cap: -50 },
};

const NINETY_DAYS = 90 * 86_400_000;

function decayMultiplier(occurredAt: Date) {
  const ageMs = Date.now() - occurredAt.getTime();
  if (ageMs <= 30 * 86_400_000) return 1;
  if (ageMs >= NINETY_DAYS) return 0.5;
  const months = ageMs / (30 * 86_400_000);
  return Math.max(0.5, 1 - 0.1 * Math.floor(months));
}

export async function recomputeEngagementScores(workspaceId?: string) {
  const since = new Date(Date.now() - NINETY_DAYS);
  const contacts = await prisma.contact.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
      emailEvents: { some: { occurredAt: { gte: since } } },
    },
    select: { id: true },
  });

  let updated = 0;
  for (const contact of contacts) {
    const events = await prisma.emailEvent.findMany({
      where: { contactId: contact.id, occurredAt: { gte: since } },
      orderBy: { occurredAt: "desc" },
      take: 200,
      select: { eventType: true, occurredAt: true },
    });

    const accumulators: Partial<Record<EmailEventType, number>> = {};
    let score = 0;

    for (const event of events) {
      const weight = EVENT_WEIGHTS[event.eventType];
      if (!weight) continue;
      const current = accumulators[event.eventType] ?? 0;
      if (weight.cap >= 0 && current >= weight.cap) continue;
      if (weight.cap < 0 && current <= weight.cap) continue;
      const adjusted = weight.score * decayMultiplier(event.occurredAt);
      score += adjusted;
      accumulators[event.eventType] = current + Math.abs(weight.score);
    }

    const clamped = Math.max(0, Math.min(100, Math.round(score)));
    await prisma.contact.update({ where: { id: contact.id }, data: { engagementScore: clamped } });
    updated += 1;
  }

  return { updated, contactCount: contacts.length };
}

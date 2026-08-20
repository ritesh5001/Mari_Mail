import { unstable_cache } from "next/cache";
import { prisma } from "@marimail/db";
import { creditReasonLabel } from "@/lib/credit-reasons";

/**
 * The workspace activity feed.
 *
 * Plenty happens in MariMail without anyone watching: drips run overnight,
 * phone numbers arrive by webhook minutes after they were paid for, credits
 * move, replies land. None of it was surfaced anywhere, so the bell in the
 * header had nothing behind it and a customer's first sign that a reveal had
 * failed was the balance looking wrong.
 *
 * Assembled at read time from tables that already exist rather than written to
 * a dedicated events table. Two reasons: no migration, and — more importantly
 * — the whole history is available on the first deploy. A new table would
 * start empty and lose everything that has already happened.
 *
 * DUPLICATION IS THE REAL DESIGN CONSTRAINT HERE. CreditLedger already records
 * the money side of most events, so unioning it with Payment and Referral
 * would report the same referral payout and the same top-up twice. Each event
 * therefore has exactly one owner:
 *
 *   · CreditLedger        — every credit movement, whatever caused it. This
 *                           already covers top-ups, referral rewards, plan
 *                           replenishment, reveals and refunds, so Payment and
 *                           Referral are deliberately NOT read here.
 *   · ApolloPhoneRequest  — DELIVERED only. The charge is already a ledger
 *                           row; the number *arriving* later is the news, and
 *                           a failure's refund is already a REFUND row.
 *   · ApolloDripJob       — the last run of each drip. The reveals it performs
 *                           are ledger rows; "this drip added 40 contacts" is
 *                           not recorded anywhere else.
 *   · EmailEvent          — REPLIED only. Sends and opens would drown
 *                           everything else, and a reply is the event the
 *                           whole product exists to produce.
 */
export type ActivityKind = "credit" | "phone" | "drip" | "reply";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  at: Date;
  title: string;
  detail: string | null;
  href: string | null;
  /** Credit movement, when the row is one. Drives the +/- styling. */
  delta: number | null;
};

/** How many items each source contributes before the merge. */
const PER_SOURCE = 40;

async function getActivityImpl(
  workspaceId: string,
  limit: number,
  beforeIso: string | null,
  kind: ActivityKind | "all",
): Promise<ActivityItem[]> {
  // Cursor is passed as an ISO string so the memoised wrapper has a primitive
  // cache key; Date objects don't compare usefully there.
  const before = beforeIso ? new Date(beforeIso) : null;
  const olderThan = before ? { lt: before } : undefined;
  // A filtered view queries only the source that owns that kind. Filtering the
  // merged page in the UI instead would show "2 replies" out of a 30-row page
  // and then page by a cursor that ignored the filter.
  const wants = (candidate: ActivityKind) => kind === "all" || kind === candidate;
  const take = PER_SOURCE;

  try {
    const [credits, phones, drips, replies] = await Promise.all([
      wants("credit")
        ? prisma.creditLedger.findMany({
            where: { workspaceId, ...(olderThan ? { createdAt: olderThan } : {}) },
            orderBy: { createdAt: "desc" },
            take,
          })
        : [],

      wants("phone")
        ? prisma.apolloPhoneRequest.findMany({
            where: {
              workspaceId,
              status: "DELIVERED",
              // Ordering and filtering both use settledAt, so exclude rows
              // where it was never set — a DELIVERED row without one would
              // sort as null.
              settledAt: { not: null, ...(olderThan ?? {}) },
            },
            orderBy: { settledAt: "desc" },
            take,
          })
        : [],

      wants("drip")
        ? prisma.apolloDripJob.findMany({
            where: { workspaceId, lastRunAt: { not: null, ...(olderThan ?? {}) } },
            orderBy: { lastRunAt: "desc" },
            take,
            select: { id: true, name: true, listId: true, lastRunAt: true, lastRunAdded: true },
          })
        : [],

      wants("reply")
        ? prisma.emailEvent.findMany({
            where: {
              workspaceId,
              eventType: "REPLIED",
              ...(olderThan ? { occurredAt: olderThan } : {}),
            },
            orderBy: { occurredAt: "desc" },
            take,
            select: {
              id: true,
              occurredAt: true,
              campaignId: true,
              contact: { select: { firstName: true, lastName: true, companyName: true } },
            },
          })
        : [],
    ]);

    const items: ActivityItem[] = [
      ...credits.map((row): ActivityItem => ({
        id: `credit:${row.id}`,
        kind: "credit",
        at: row.createdAt,
        title: creditReasonLabel(row.reason),
        detail: row.detail,
        href: "/dashboard/billing/credits",
        delta: row.delta,
      })),

      ...phones.map((row): ActivityItem => ({
        id: `phone:${row.id}`,
        kind: "phone",
        at: row.settledAt!,
        title: "Phone number delivered",
        detail: row.phone,
        href: null,
        delta: null,
      })),

      ...drips.map((row): ActivityItem => ({
        id: `drip:${row.id}:${row.lastRunAt!.getTime()}`,
        kind: "drip",
        at: row.lastRunAt!,
        title:
          row.lastRunAdded && row.lastRunAdded > 0
            ? `Drip added ${row.lastRunAdded.toLocaleString("en-US")} contact${row.lastRunAdded === 1 ? "" : "s"}`
            : "Drip ran, nothing new found",
        detail: row.name,
        href: `/dashboard/lists/${row.listId}`,
        delta: null,
      })),

      ...replies.map((row): ActivityItem => {
        const name = `${row.contact.firstName} ${row.contact.lastName}`.trim();
        return {
          id: `reply:${row.id}`,
          kind: "reply",
          at: row.occurredAt,
          title: "Reply received",
          detail: name ? `${name}${row.contact.companyName ? ` · ${row.contact.companyName}` : ""}` : null,
          href: `/dashboard/campaigns/${row.campaignId}`,
          delta: null,
        };
      }),
    ];

    // One global ordering across four independently-paged sources. Taking
    // PER_SOURCE from each before slicing is what makes this correct: the
    // merged head can never need an item that a source didn't contribute,
    // as long as PER_SOURCE >= limit.
    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    return items.slice(0, limit);
  } catch (err) {
    // The bell renders inside the dashboard shell — on every page. A failure
    // here must not take the whole app down with it.
    console.error("[activity] getActivity failed:", err);
    return [];
  }
}

export const getActivity = unstable_cache(
  (
    workspaceId: string,
    limit = 8,
    beforeIso: string | null = null,
    kind: ActivityKind | "all" = "all",
  ) => getActivityImpl(workspaceId, limit, beforeIso, kind),
  ["workspace-activity"],
  { revalidate: 60, tags: ["activity"] },
);

/**
 * Page size for the full activity page. Kept under PER_SOURCE so the merge
 * above stays correct — see the note there.
 */
export const ACTIVITY_PAGE_SIZE = 30;

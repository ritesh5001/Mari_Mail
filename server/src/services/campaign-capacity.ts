import { prisma } from "@marimail/db";

/**
 * What a campaign's connected mailboxes let it do: how much it may send in a
 * day, and how fast it may send it.
 *
 * Its own module because both the sender and the manual scheduler need it, and
 * the scheduler cannot import from sequence-sender without a cycle.
 */

/**
 * The inboxes a campaign is actually allowed to send from.
 *
 * An empty `accountIds` means "rotate across every connected mailbox", which is
 * what a campaign created without an explicit choice gets. Platform inboxes are
 * always excluded — campaign mail must come from a user's own mailbox so replies
 * reach them and the message lands in their Sent folder.
 */
export async function campaignInboxes(workspaceId: string, accountIds: string[]) {
  return prisma.emailAccount.findMany({
    where: {
      workspaceId,
      status: { in: ["ACTIVE", "WARMING"] },
      isPlatformDefault: false,
      id: accountIds.length ? { in: accountIds } : undefined,
    },
    select: { id: true, email: true, dailyLimit: true, status: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * A campaign's daily send cap: the sum of its mailboxes' own daily limits.
 *
 * Derived rather than stored, deliberately. Mailboxes can be attached and
 * detached at any point in a campaign's life — including mid-flight — and each
 * mailbox's own limit can be edited independently. A copy of this number taken
 * at launch would be wrong the moment any of that happened, and wrong in the
 * expensive direction: silently throttling a campaign the user had just added
 * capacity to, with nothing on screen to explain it.
 */
export async function resolveCampaignDailyCap(
  workspaceId: string,
  accountIds: string[],
): Promise<{ cap: number; inboxes: Awaited<ReturnType<typeof campaignInboxes>> }> {
  const inboxes = await campaignInboxes(workspaceId, accountIds);
  return { cap: inboxes.reduce((sum, inbox) => sum + inbox.dailyLimit, 0), inboxes };
}

/**
 * Never let the campaign gap collapse to zero. Zero means "no spacing at all"
 * everywhere else in the scheduler, so a large fleet must not accidentally
 * switch pacing off entirely.
 */
const MIN_CAMPAIGN_GAP_SECONDS = 5;

/**
 * The campaign-level gap, divided across the mailboxes sending for it.
 *
 * The two gaps protect different things and were being conflated. The PER-INBOX
 * gap is the one that matters for deliverability: a mailbox that sends faster
 * than a human plausibly types gets throttled or filtered, so each mailbox
 * keeps its own 5–20 min spacing no matter what. The CAMPAIGN gap is only about
 * overall pacing, and applying the same 5–20 min to the campaign as a whole
 * meant ten mailboxes sent no faster than one — the extra nine bought daily
 * volume and no speed at all.
 *
 * Dividing by the mailbox count fixes that and lands exactly where it should:
 * with ten mailboxes and a 5–20 min setting the campaign emits roughly every
 * 30 s–2 min, rotation hands each send to a different mailbox, and each
 * individual mailbox still ends up sending about once every 5–20 min. Campaign
 * throughput scales with the fleet; per-mailbox behaviour does not change.
 *
 * The division is also what keeps the two from fighting. Left undivided, the
 * campaign gap is the binding constraint and the fleet is wasted; divided much
 * further than this, jobs would reserve campaign slots faster than any inbox
 * could accept them and simply defer in a loop, burning Redis commands to
 * achieve nothing.
 */
export function dividedCampaignGap(
  minSeconds: number,
  maxSeconds: number,
  inboxCount: number,
): { min: number; max: number } {
  const max = Math.max(maxSeconds, minSeconds);
  // Both zero is a deliberate "no campaign spacing" — respect it.
  if (max <= 0) return { min: 0, max: 0 };

  const n = Math.max(1, inboxCount);
  return {
    min: Math.max(MIN_CAMPAIGN_GAP_SECONDS, Math.round(minSeconds / n)),
    max: Math.max(MIN_CAMPAIGN_GAP_SECONDS, Math.round(max / n)),
  };
}

/** Everything the sender and scheduler need about a campaign's pacing. */
export async function resolveCampaignPacing(
  workspaceId: string,
  accountIds: string[],
  sendGapSeconds: number,
  sendGapMaxSeconds: number,
) {
  const { cap, inboxes } = await resolveCampaignDailyCap(workspaceId, accountIds);
  const gap = dividedCampaignGap(sendGapSeconds, sendGapMaxSeconds, inboxes.length);
  return { cap, inboxes, gap, inboxCount: inboxes.length };
}

import { prisma } from "@marimail/db";
import { describeMembership } from "./membership.service.js";

/**
 * True when the workspace has connected at least one of their own mailboxes
 * (ACTIVE or WARMING). The platform Resend inbox is intentionally excluded —
 * campaigns must send from the user's own mailbox so replies land where the
 * recipient expects and the message appears in the sender's Sent folder.
 * Workspaces without a user inbox are hard-blocked from launching campaigns
 * and see the "Connect an inbox" empty state in the UI.
 */
export async function workspaceHasSendingInbox(workspaceId: string): Promise<boolean> {
  const count = await prisma.emailAccount.count({
    where: {
      workspaceId,
      status: { in: ["ACTIVE", "WARMING"] },
      isPlatformDefault: false,
    },
  });
  return count > 0;
}

/**
 * True when the workspace's membership still entitles it to send.
 *
 * Deliberately permissive about *when* it says no:
 *
 *   · TRIALING with time left      → yes
 *   · ACTIVE                       → yes
 *   · PAST_DUE inside grace        → YES. A declined card must not silently
 *                                    stop a live campaign mid-sequence; the
 *                                    customer gets emailed and has days to fix
 *                                    it.
 *   · CANCELED, or past grace      → no
 *   · no dates on record at all    → yes. Legacy workspaces predate this
 *                                    bookkeeping and must not be locked out by
 *                                    the absence of data.
 *
 * The failure mode to avoid here is cutting off a paying customer over a
 * bookkeeping edge case, which is worse than a few days of unpaid sending.
 */
export async function workspaceMembershipAllowsSending(workspaceId: string): Promise<boolean> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      plan: true,
      billingStatus: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
    },
  });
  if (!workspace) return false;
  return describeMembership(workspace).active;
}

export const MEMBERSHIP_LAPSED_MESSAGE =
  "Your plan has expired. Renew under Settings → Plan & billing to start sending again — nothing has been deleted.";

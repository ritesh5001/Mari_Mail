import { prisma } from "@marimail/db";

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

import { prisma } from "@marimail/db";
import { decryptJsonSecret, encryptJsonSecret } from "../email-account.service.js";
import { getOrCreateApolloSettings } from "./settings.js";

/**
 * Which Apollo account a workspace's calls should go through.
 *
 * Two sources exist and they bill very differently:
 *
 *  - the PLATFORM key in ApolloSettings, shared by every workspace and paid for
 *    by us — so using it costs the workspace platform credits;
 *  - a WORKSPACE key the customer connected themselves, which spends their own
 *    Apollo quota — so it must NOT also cost them platform credits.
 *
 * That is the whole reason this returns `billsPlatformCredits`. Charging for a
 * reveal the customer already paid Apollo for would be billing them twice for
 * one lookup.
 *
 * A workspace key is never a fallback for anyone else: the lookup is scoped by
 * workspaceId, so one customer's key can never serve another's traffic.
 */
export type ApolloCredentials = {
  apiKey: string;
  apiBaseUrl: string;
  /** Platform key → charge credits. Workspace's own key → don't. */
  billsPlatformCredits: boolean;
  source: "workspace" | "platform";
  /** Set only for a workspace key, so failures can be recorded against it. */
  accountId: string | null;
  accountLabel: string | null;
};

export async function resolveApolloCredentials(
  workspaceId: string | null,
): Promise<ApolloCredentials | null> {
  if (workspaceId) {
    // Prefer the workspace's own key. `isDefault` picks which one when several
    // are connected; falling back to the newest usable one means deleting the
    // default doesn't silently push the workspace onto platform billing.
    const own = await prisma.workspaceApolloAccount.findFirst({
      where: { workspaceId, status: { not: "ERROR" } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    if (own) {
      const key = decryptJsonSecret<{ apiKey: string }>(own.apiKey)?.apiKey?.trim();
      if (key) {
        return {
          apiKey: key,
          apiBaseUrl: own.apiBaseUrl,
          billsPlatformCredits: false,
          source: "workspace",
          accountId: own.id,
          accountLabel: own.label,
        };
      }
      // Undecryptable — almost always ENCRYPTION_KEY having changed. Fall
      // through to the platform key rather than failing the request, but say
      // so, because silently switching who pays is exactly the kind of thing
      // that should never happen quietly.
      console.warn(
        `[apollo] workspace=${workspaceId} account=${own.id} key could not be decrypted; falling back to the platform key.`,
      );
    }
  }

  const settings = await getOrCreateApolloSettings();
  if (!settings.enabled) return null;
  const platformKey = decryptJsonSecret<{ apiKey: string }>(settings.apiKey)?.apiKey?.trim();
  if (!platformKey) return null;
  return {
    apiKey: platformKey,
    apiBaseUrl: settings.apiBaseUrl,
    billsPlatformCredits: true,
    source: "platform",
    accountId: null,
    accountLabel: null,
  };
}

/** Record the outcome of a live call against the workspace account that made it. */
export async function markApolloAccountResult(
  accountId: string | null,
  outcome: { ok: true; info?: string } | { ok: false; error: string },
) {
  if (!accountId) return;
  await prisma.workspaceApolloAccount
    .update({
      where: { id: accountId },
      data: outcome.ok
        ? { status: "ACTIVE", lastTestAt: new Date(), lastTestError: null, lastTestInfo: outcome.info ?? null }
        : { status: "ERROR", lastTestAt: new Date(), lastTestError: outcome.error.slice(0, 500) },
    })
    .catch(() => undefined);
}

export { encryptJsonSecret };

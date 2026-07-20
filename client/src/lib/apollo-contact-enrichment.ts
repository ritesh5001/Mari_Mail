import { prisma } from "@marimail/db";

/**
 * Fills in the `website` field on Apollo-sourced contact rows that were saved
 * before we started persisting it — using ApolloRevealCache as the source of
 * truth. This lets `matchContactToVessel` reach its HIGH-confidence "contact
 * website ↔ vessel company website" path so the Ship / ETA badge shows up on
 * the list detail page and the campaign editor's Leads tab.
 *
 * Operates in-memory only: never writes back to the DB, so it's safe to call
 * from server data-fetch paths that may run against workspaces we don't own.
 *
 * The generic bound is the loosest possible so both `select`-shaped and full
 * Contact rows can flow through without needing individual types per caller.
 */
export async function enrichApolloContactsWithCachedWebsite<
  T extends {
    id: string;
    website: string | null;
    source?: string | null;
    customFields?: unknown;
  },
>(contacts: T[]): Promise<T[]> {
  const missing: Array<{ contact: T; apolloId: string }> = [];
  for (const contact of contacts) {
    if (contact.website) continue;
    if (contact.source !== "APOLLO") continue;
    const fields = contact.customFields;
    if (!fields || typeof fields !== "object") continue;
    const apolloId = (fields as Record<string, unknown>).apolloId;
    if (typeof apolloId !== "string" || !apolloId) continue;
    missing.push({ contact, apolloId });
  }

  if (missing.length === 0) return contacts;

  const cacheRows = await prisma.apolloRevealCache.findMany({
    where: { apolloId: { in: missing.map((m) => m.apolloId) } },
    select: { apolloId: true, companyWebsite: true, companyDomain: true },
  });

  const websiteByApolloId = new Map<string, string>();
  for (const row of cacheRows) {
    const site = row.companyWebsite ?? row.companyDomain;
    if (site) websiteByApolloId.set(row.apolloId, site);
  }
  if (websiteByApolloId.size === 0) return contacts;

  return contacts.map((contact) => {
    if (contact.website || contact.source !== "APOLLO") return contact;
    const fields = contact.customFields;
    if (!fields || typeof fields !== "object") return contact;
    const apolloId = (fields as Record<string, unknown>).apolloId;
    if (typeof apolloId !== "string") return contact;
    const site = websiteByApolloId.get(apolloId);
    if (!site) return contact;
    return { ...contact, website: site };
  });
}

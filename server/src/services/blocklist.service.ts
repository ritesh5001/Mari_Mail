import { prisma, type BlockKind } from "@marimail/db";
import {
  companyBlockValue,
  emailDomain,
  isPublicEmailDomain,
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
} from "@marimail/utils/blocklist";

// Re-exported so existing importers (the blocklist route) keep one import site.
export {
  companyBlockValue,
  emailDomain,
  isPublicEmailDomain,
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
};

/**
 * The workspace do-not-contact list.
 *
 * Two kinds of entry, one matcher:
 *   CONTACT — a single person, matched on their email address.
 *   COMPANY — every person at a company, matched on the email DOMAIN first and
 *             on a normalised company name second.
 *
 * Domain is the primary company key because it is the only identifier that
 * survives the round trip through a data provider: "Maersk", "A.P. Moller –
 * Maersk" and "Maersk Line A/S" are three strings for one company, but
 * `maersk.com` is `maersk.com`. Name matching is kept as a fallback for the
 * rows that have a company name and no usable domain (CSV imports, manual
 * entry), normalised so punctuation and the usual suffixes don't defeat it.
 *
 * Every campaign path funnels through `filterBlockedContacts` or
 * `isEmailBlocked`, so a block cannot be bypassed by a route that forgot about
 * it — see the callers in campaign-targets and sequence-sender.
 */

export type BlockIndex = {
  emails: Set<string>;
  /** COMPANY values: domains and normalised names live in the same set. */
  companies: Set<string>;
  isEmpty: boolean;
};

const EMPTY_INDEX: BlockIndex = { emails: new Set(), companies: new Set(), isEmpty: true };

/**
 * Loads a workspace's blocks once, for filtering a batch of contacts.
 *
 * Deliberately not cached: a user who blocks a company expects the next send
 * to respect it, and the read is one indexed query against a table that holds
 * tens of rows for a typical workspace.
 */
export async function loadBlockIndex(workspaceId: string): Promise<BlockIndex> {
  const rows = await prisma.workspaceBlock.findMany({
    where: { workspaceId },
    select: { kind: true, value: true },
  });
  if (rows.length === 0) return EMPTY_INDEX;

  const emails = new Set<string>();
  const companies = new Set<string>();
  for (const row of rows) {
    if (row.kind === "CONTACT") emails.add(row.value);
    else companies.add(row.value);
  }
  return { emails, companies, isEmpty: false };
}

export type BlockCandidate = {
  email?: string | null;
  companyName?: string | null;
  website?: string | null;
  companyDomain?: string | null;
};

/** Why a candidate was blocked, or null when it wasn't. */
export function blockReason(index: BlockIndex, candidate: BlockCandidate): BlockKind | null {
  if (index.isEmpty) return null;

  const email = candidate.email ? normalizeEmail(candidate.email) : null;
  if (email && index.emails.has(email)) return "CONTACT";

  if (index.companies.size > 0) {
    const domains = [
      normalizeDomain(candidate.companyDomain),
      normalizeDomain(candidate.website),
      email && !isPublicEmailDomain(emailDomain(email)) ? emailDomain(email) : null,
    ];
    for (const domain of domains) {
      if (domain && index.companies.has(domain)) return "COMPANY";
    }
    const name = normalizeCompanyName(candidate.companyName);
    if (name && index.companies.has(name)) return "COMPANY";
  }

  return null;
}

export function isBlocked(index: BlockIndex, candidate: BlockCandidate): boolean {
  return blockReason(index, candidate) !== null;
}

/**
 * Drops every blocked contact from a batch. The chokepoint used by campaign
 * target resolution — see `removeSuppressed` in campaign-targets.
 */
export async function filterBlockedContacts<T extends BlockCandidate>(
  workspaceId: string,
  contacts: T[],
): Promise<T[]> {
  if (contacts.length === 0) return contacts;
  const index = await loadBlockIndex(workspaceId);
  if (index.isEmpty) return contacts;
  return contacts.filter((contact) => !isBlocked(index, contact));
}

/**
 * Single-address check for the send-time guards, which hold one recipient and
 * no batch to amortise a load over.
 */
export async function isEmailBlocked(
  workspaceId: string,
  email: string,
  extra?: Omit<BlockCandidate, "email">,
): Promise<BlockKind | null> {
  const index = await loadBlockIndex(workspaceId);
  return blockReason(index, { email, ...extra });
}

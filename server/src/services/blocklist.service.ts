import { prisma, type BlockKind } from "@marimail/db";

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

/** Company-name noise that carries no identity. Stripped before comparison. */
const COMPANY_SUFFIXES = [
  "ltd",
  "limited",
  "llc",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "gmbh",
  "bv",
  "nv",
  "sa",
  "srl",
  "spa",
  "as",
  "ab",
  "pte",
  "pvt",
  "private",
  "plc",
  "ag",
  "kg",
  "sarl",
  "oy",
  "aps",
  "group",
  "holdings",
  "holding",
  "shipping",
  "marine",
  "maritime",
];

/** Free-mail domains: blocking one would block half the address book. */
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "yandex.com",
  "gmx.com",
  "zoho.com",
  "rediffmail.com",
  "qq.com",
  "163.com",
  "126.com",
]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The domain part of an email, or null when there isn't one. */
export function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0 || at === email.length - 1) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

/**
 * Reduces a URL, host or bare domain to a registrable-looking host.
 * `https://www.Maersk.com/careers` and `WWW.MAERSK.COM` both give `maersk.com`.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^[a-z]+:\/\//, "");
  value = value.split("/")[0] ?? "";
  value = value.split("?")[0] ?? "";
  value = value.split("@").pop() ?? "";
  value = value.replace(/^www\./, "");
  value = value.replace(/:\d+$/, "");
  if (!value.includes(".")) return null;
  return value || null;
}

/**
 * Normalises a company name for comparison: lowercase, punctuation removed,
 * legal/industry suffixes dropped. Returns null when nothing identifying is
 * left, so we never store a block whose key is the empty string.
 */
export function normalizeCompanyName(input: string | null | undefined): string | null {
  if (!input) return null;
  const words = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !COMPANY_SUFFIXES.includes(word));
  const joined = words.join(" ").trim();
  // Too little left to identify anyone. "Jo Marine Ltd" reduces to "jo", and a
  // two-character key would happily match some other company that also
  // normalises down to it — a company block is broad enough already without
  // matching by accident. Callers treat null as "can't block by name", and the
  // API turns that into a clear 400 rather than a silent over-block.
  if (joined.length < 3) return null;
  return joined;
}

/** True when a domain is a free-mail provider and unusable as a company key. */
export function isPublicEmailDomain(domain: string | null): boolean {
  return domain !== null && PUBLIC_EMAIL_DOMAINS.has(domain);
}

/**
 * The company match keys a block should carry, given whatever the caller knows.
 * Domain first; name only when there's no usable domain, so blocking "Maersk"
 * by domain can't be silently widened by a name collision.
 */
export function companyBlockValue(input: {
  domain?: string | null;
  website?: string | null;
  email?: string | null;
  companyName?: string | null;
}): string | null {
  const domain =
    normalizeDomain(input.domain) ??
    normalizeDomain(input.website) ??
    (() => {
      const fromEmail = emailDomain(input.email);
      return isPublicEmailDomain(fromEmail) ? null : fromEmail;
    })();
  if (domain && !isPublicEmailDomain(domain)) return domain;
  return normalizeCompanyName(input.companyName);
}

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

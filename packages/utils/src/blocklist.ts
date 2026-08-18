/**
 * How a blocklist entry matches a person or a company.
 *
 * These live in the shared package because BOTH sides of the feature depend on
 * agreeing exactly: the server matches provider search rows in memory, while
 * database reads exclude blocked people through a Prisma where-clause built
 * from the same keys. Two copies of "what counts as the same company" would
 * drift, and the symptom would be a blocked company reappearing on one screen
 * but not another.
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

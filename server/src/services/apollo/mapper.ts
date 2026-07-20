import type { FilterConfig } from "@marimail/types";
import { SENIORITY_MAP } from "../maribiz/mapper.js";
import type { ApolloPerson, ApolloSearchParams } from "./client.js";

const EMAIL_STATUS_MAP: Record<string, string> = {
  verified: "VALID",
  valid: "VALID",
  likely_to_engage: "VALID",
  guessed: "RISKY",
  unavailable: "UNKNOWN",
  bounced: "INVALID",
  spam_trap: "INVALID",
  unverified: "UNKNOWN",
};

function normaliseSeniority(value: string | null | undefined): string {
  if (!value) return "MID";
  return SENIORITY_MAP[value.toLowerCase()] ?? "MID";
}

function normaliseEmailStatus(value: string | null | undefined): string {
  if (!value) return "UNKNOWN";
  return EMAIL_STATUS_MAP[value.toLowerCase()] ?? "UNKNOWN";
}

function capitalise(value: string | null | undefined): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function looksLikeDomain(value: string): boolean {
  return /\.[a-z]{2,}$/i.test(value.trim()) && !value.includes(" ");
}

export function filterConfigToApolloParams(
  filterConfig: FilterConfig | undefined,
  limit: number,
): ApolloSearchParams {
  const params: ApolloSearchParams = { per_page: limit, page: 1 };
  const keywords: string[] = [];
  const titles: string[] = [];
  const domains: string[] = [];
  const locations: string[] = [];

  const conditions = filterConfig?.groups?.flatMap((g) => g.conditions ?? []) ?? [];
  for (const c of conditions) {
    if (typeof c.value !== "string" || !c.value.trim()) continue;
    const value = c.value.trim();
    if (c.field === "title") {
      titles.push(value);
    } else if (c.field === "country") {
      locations.push(value);
    } else if (c.field === "companyName") {
      if (looksLikeDomain(value)) domains.push(value);
      else keywords.push(value);
    } else {
      keywords.push(value);
    }
  }

  if (keywords.length) params.q_keywords = keywords.join(" ");
  if (titles.length) params.person_titles = titles;
  if (domains.length) params.q_organization_domains_list = domains;
  if (locations.length) params.organization_locations = locations;
  return params;
}

function maskEmail(email: string | null | undefined, domainFallback: string | null): string {
  if (email && email.includes("@")) {
    const [, domain] = email.split("@");
    return `••••••@${domain}`;
  }
  if (domainFallback) return `••••••@${domainFallback}`;
  return "••••••@•••";
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  const tail = phone.replace(/\D/g, "").slice(-4);
  return tail ? `•••• ••• ${tail}` : "•••• ••• ••••";
}

function isLockedEmail(email: string | null | undefined): boolean {
  if (!email) return true;
  return /email_not_unlocked|locked|hidden/i.test(email);
}

export type ApolloContactRow = {
  id: string;
  externalId: string;
  source: "APOLLO";
  firstName: string;
  lastName: string;
  fullName: string;
  title: string | null;
  companyId: null;
  companyKind: "GENERIC";
  companyName: string;
  email: string;
  emailLocked: boolean;
  emailAvailable: boolean;
  secondaryEmail: null;
  department: string[];
  contactOwnerName: null;
  mobilePhone: string | null;
  phoneLocked: boolean;
  phoneAvailable: boolean;
  corporatePhone: null;
  homePhone: null;
  otherPhone: null;
  personLinkedinUrl: string | null;
  website: string | null;
  // Apollo org primary domain — the domain our vessel-derived search matched
  // on. More reliable than website for contact↔vessel association because
  // Apollo bridges related domains inside one org (citi.com vs citibank.com).
  companyDomain: string | null;
  companyLinkedinUrl: string | null;
  country: string | null;
  subsidiaryOf: null;
  salesforceId: null;
  seniority: string;
  marineRole: "OTHER";
  emailStatus: string;
  engagementScore: number;
  tags: string[];
  verified: boolean;
  createdAt: string;
  updatedAt: string;
};

export function apolloPersonToContactRow(person: ApolloPerson): ApolloContactRow {
  const first = capitalise(person.first_name) || person.name?.split(" ")[0] || "";
  // Apollo search returns last_name_obfuscated (e.g. "Br***m"); full last_name only appears after /people/match.
  const last =
    capitalise(person.last_name) ||
    person.last_name_obfuscated ||
    person.name?.split(" ").slice(1).join(" ") ||
    "";
  const fullName = person.name || `${first} ${last}`.trim() || first || "(unknown)";
  const company = person.organization?.name || "";
  const domain = person.organization?.primary_domain ?? null;
  // Apollo tells us up-front whether it even HAS an email for this person.
  // `has_email: false` on a search response means there is nothing to reveal —
  // spending a credit would return "unavailable" and refund. We surface that
  // as `emailAvailable: false` so the UI shows "No email" instead of a
  // dead-end "Reveal email" button. `emailLocked` now means specifically
  // "an email exists but is hidden behind a credit".
  const emailAvailable = person.has_email !== false; // default true on search responses
  const emailLocked = emailAvailable && (isLockedEmail(person.email) || !person.email);
  const hasPhone = person.has_direct_phone === true || person.has_direct_phone === "Yes" || person.has_direct_phone === "Maybe";
  const rawPhone = person.phone_numbers?.[0]?.sanitized_number || person.phone_numbers?.[0]?.raw_number || null;
  const phoneAvailable = hasPhone || Boolean(rawPhone);
  const phoneLocked = !rawPhone && hasPhone;
  const now = new Date().toISOString();

  return {
    id: `apollo:${person.id}`,
    externalId: person.id,
    source: "APOLLO",
    firstName: first || fullName,
    lastName: last,
    fullName,
    title: person.title ?? null,
    companyId: null,
    companyKind: "GENERIC",
    companyName: company,
    email: emailLocked ? maskEmail(person.email, domain) : person.email ?? "",
    emailLocked,
    emailAvailable,
    secondaryEmail: null,
    department: [],
    contactOwnerName: null,
    mobilePhone: phoneLocked ? maskPhone("xxxx") : rawPhone,
    phoneLocked,
    phoneAvailable,
    corporatePhone: null,
    homePhone: null,
    otherPhone: null,
    personLinkedinUrl: person.linkedin_url ?? null,
    website: person.organization?.website_url ?? null,
    companyDomain: domain,
    companyLinkedinUrl: person.organization?.linkedin_url ?? null,
    country: person.country ?? null,
    subsidiaryOf: null,
    salesforceId: null,
    seniority: normaliseSeniority(person.seniority),
    marineRole: "OTHER",
    emailStatus: !emailAvailable ? "UNAVAILABLE" : emailLocked ? "LOCKED" : normaliseEmailStatus(person.email_status),
    engagementScore: 0,
    tags: [],
    verified: !emailLocked,
    createdAt: now,
    updatedAt: now,
  };
}

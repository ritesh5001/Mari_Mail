import type { FilterConfig } from "@marimail/types";
import type { MaribizPerson, MaribizSearchParams } from "./client.js";

export const SENIORITY_MAP: Record<string, string> = {
  entry: "ENTRY",
  intern: "INTERN",
  mid: "MID",
  senior: "SENIOR",
  lead: "LEAD",
  manager: "MANAGER",
  director: "DIRECTOR",
  vp: "VP",
  c_suite: "C_LEVEL",
  c_level: "C_LEVEL",
  founder: "FOUNDER",
  owner: "OWNER",
};

const EMAIL_STATUS_MAP: Record<string, string> = {
  Verified: "VALID",
  Valid: "VALID",
  Risky: "RISKY",
  Invalid: "INVALID",
};

function normaliseSeniority(value: string | null | undefined): string {
  if (!value) return "MID";
  return SENIORITY_MAP[value.toLowerCase()] ?? "MID";
}

function normaliseEmailStatus(value: string | null | undefined): string {
  if (!value) return "UNKNOWN";
  return EMAIL_STATUS_MAP[value] ?? "UNKNOWN";
}

function capitalise(value: string | null | undefined): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Maribiz only supports a single `q` keyword. Other UI filters (country, seniority,
 * etc.) can't be sent precisely — we fold the freetext ones into `q` so results
 * are at least topically relevant.
 */
export function filterConfigToMaribizParams(
  filterConfig: FilterConfig | undefined,
  limit: number,
): MaribizSearchParams {
  const terms: string[] = [];
  const conditions = filterConfig?.groups?.flatMap((g) => g.conditions ?? []) ?? [];

  for (const c of conditions) {
    if (typeof c.value !== "string" || !c.value.trim()) continue;
    if (c.field === "keyword" || c.field === "title" || c.field === "companyName" || c.field === "country") {
      terms.push(c.value.trim());
    }
  }

  const q = terms.join(" ").trim();
  return { q: q || undefined, limit };
}

export type MaribizContactRow = {
  id: string;
  externalId: number;
  source: "MARIBIZ";
  firstName: string;
  lastName: string;
  fullName: string;
  title: string | null;
  companyId: null;
  companyKind: "GENERIC";
  companyName: string;
  email: string;
  secondaryEmail: null;
  department: string[];
  contactOwnerName: null;
  mobilePhone: string | null;
  corporatePhone: null;
  homePhone: null;
  otherPhone: null;
  personLinkedinUrl: string | null;
  website: null;
  companyLinkedinUrl: null;
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

export function maribizPersonToContactRow(person: MaribizPerson): MaribizContactRow {
  const first = capitalise(person.person_first_name) || person.person_name?.split(" ")[0] || "";
  const last = capitalise(person.person_last_name) || person.person_name?.split(" ").slice(1).join(" ") || "";
  const fullName = person.person_name || `${first} ${last}`.trim();
  const company = capitalise(person.organization_name) || "";
  const phone = person.person_sanitized_phone || person.person_phone || null;
  const created = person.created_at || person.person_vacuumed_at || new Date().toISOString();

  return {
    id: `maribiz:${person.id}`,
    externalId: person.id,
    source: "MARIBIZ",
    firstName: first || fullName,
    lastName: last,
    fullName,
    title: person.person_title,
    companyId: null,
    companyKind: "GENERIC",
    companyName: company,
    email: person.person_email || "",
    secondaryEmail: null,
    department: [],
    contactOwnerName: null,
    mobilePhone: phone,
    corporatePhone: null,
    homePhone: null,
    otherPhone: null,
    personLinkedinUrl: person.person_linkedin_url,
    website: null,
    companyLinkedinUrl: null,
    country: person.location_country,
    subsidiaryOf: null,
    salesforceId: null,
    seniority: normaliseSeniority(person.person_seniority),
    marineRole: "OTHER",
    emailStatus: normaliseEmailStatus(person.person_email_status),
    engagementScore: 0,
    tags: [],
    verified: false,
    createdAt: created,
    updatedAt: created,
  };
}

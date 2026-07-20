import crypto from "node:crypto";
import type { FilterCondition, FilterConfig } from "@marimail/types";

export const DESIGN_TOKENS = {
  navy: "#0A2342",
  ocean: "#0077B6",
  gold: "#C9A84C",
} as const;

export function slugify(input: string) {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

  return slug || `workspace-${crypto.randomBytes(4).toString("hex")}`;
}

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function getSigningSecret() {
  const secret = process.env.JWT_ACCESS_SECRET ?? process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("JWT_ACCESS_SECRET or ENCRYPTION_KEY is required for signed tokens");
  }
  return secret;
}

export function createSignedToken(payload: Record<string, unknown>) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", getSigningSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySignedToken<T extends Record<string, unknown>>(token: string): T | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", getSigningSecret()).update(body).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
}

export type EncryptedSecret = {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  ciphertext: string;
};

function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) {
    throw new Error("ENCRYPTION_KEY must be a 32-byte hex string");
  }
  return Buffer.from(key, "hex");
}

export function encryptSecret(secret: string): EncryptedSecret {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptSecret(envelope: EncryptedSecret): string {
  if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported encrypted secret envelope");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(envelope.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function parseEncryptedSecret(value: unknown): EncryptedSecret | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const envelope = value as Record<string, unknown>;
  if (
    envelope.version !== 1 ||
    envelope.algorithm !== "aes-256-gcm" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.authTag !== "string" ||
    typeof envelope.ciphertext !== "string"
  ) {
    return null;
  }

  return envelope as EncryptedSecret;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export const PUBLIC_EMAIL_DOMAINS = new Set([
  "aol.com",
  "example.com",
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mail.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
]);

export function isPublicEmailDomain(value: string | null | undefined) {
  const domain = value?.trim().toLowerCase().replace(/^www\./, "");
  return Boolean(domain && PUBLIC_EMAIL_DOMAINS.has(domain));
}

export function normalizeWebsiteDomain(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw || ["-", "n/a", "na", "none", "null"].includes(raw.toLowerCase())) return null;

  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const hostname = new URL(withProtocol).hostname.toLowerCase().replace(/\.$/, "");
    const domain = hostname.startsWith("www.") ? hostname.slice(4) : hostname;
    return domain.includes(".") ? domain : null;
  } catch {
    return null;
  }
}

function cleanupWebsiteCandidate(value: string) {
  return value
    .trim()
    .replace(/^[<([{]+/, "")
    .replace(/[>\])},.;:]+$/, "")
    .replace(/^https?:\/\/https?:\/\//i, "https://");
}

export function extractWebsiteDomains(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw || ["-", "n/a", "na", "none", "null"].includes(raw.toLowerCase())) return [];

  const domains = new Set<string>();
  const add = (candidate: string) => {
    const domain = normalizeWebsiteDomain(cleanupWebsiteCandidate(candidate));
    if (domain) domains.add(domain);
  };

  if (!raw.includes("@")) add(raw);

  const websitePattern =
    /(?:[a-z][a-z0-9+.-]*:\/\/[^\s,;()]+|www\.[^\s,;()]+|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\/[^\s,;()]*)?)/gi;

  for (const match of raw.matchAll(websitePattern)) {
    if (match.index && raw[match.index - 1] === "@") continue;
    add(match[0]);
  }

  return Array.from(domains);
}

export function extractEmailAddresses(value: string | null | undefined) {
  const raw = value?.trim().toLowerCase();
  if (!raw || ["-", "n/a", "na", "none", "null"].includes(raw)) return [];

  const addresses = new Set<string>();
  for (const match of raw.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    addresses.add(match[0].replace(/[>),.;:]+$/, ""));
  }
  return Array.from(addresses);
}

export function extractBusinessEmailDomains(value: string | null | undefined) {
  const domains = new Set<string>();
  for (const address of extractEmailAddresses(value)) {
    const domain = address.split("@")[1]?.replace(/\.$/, "").replace(/^www\./, "");
    if (domain && domain.includes(".") && !isPublicEmailDomain(domain)) {
      domains.add(domain);
    }
  }
  return Array.from(domains);
}

export function normalizeCompanyName(value: string | null | undefined) {
  const normalized = value
    ?.toLowerCase()
    .replace(/&/g, " and ")
    .replace(
      /\b(?:ag|as|bv|bvba|co|company|corp|corporation|gmbh|group|inc|jsc|kg|k\/s|limited|llc|llp|ltd|nv|plc|pte|s\.a|sa|ship|shipping|ships|spa|srl|the)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  return normalized && normalized.length >= 3 ? normalized : null;
}

export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW";

export type MatchSource =
  | "Exact email"
  | "Contact website to company website"
  | "Contact email domain to company website"
  | "Contact website to vessel email domain"
  | "Contact email domain to vessel email domain"
  | "Company name";

export type MatchedRole =
  | "Ship Owner"
  | "ISM Manager"
  | "Commercial Manager"
  | "Registered Owner"
  | "Beneficial Owner"
  | "Technical Manager"
  | "Operator";

export type MatchCompany = {
  id: string;
  role: MatchedRole;
  companyName: string;
  website: string | null;
  country: string | null;
};

type ContactMatchInput = {
  id: string;
  email: string | null;
  secondaryEmail?: string | null;
  website: string | null;
  companyName: string | null;
};

type CompanyMatchInput = {
  id: string;
  companyName: string;
  email: string | null;
  website: string | null;
  country: string | null;
};

type VesselMatchInput = {
  id: string;
  commercialManagerName: string | null;
  commercialManagerEmail: string | null;
  commercialManagerCountry: string | null;
  registeredOwnerName: string | null;
  registeredOwnerEmail: string | null;
  registeredOwnerCountry: string | null;
  beneficialOwnerName: string | null;
  beneficialOwnerEmail: string | null;
  beneficialOwnerCountry: string | null;
  technicalManagerName: string | null;
  technicalManagerEmail: string | null;
  technicalManagerCountry: string | null;
  ismManagerName: string | null;
  ismManagerEmail: string | null;
  ismManagerCountry: string | null;
  operatorName: string | null;
  operatorEmail: string | null;
  operatorCountry: string | null;
  shipOwnerCompany: CompanyMatchInput | null;
  ismManagerCompany: CompanyMatchInput | null;
  commercialManagerCompany: CompanyMatchInput | null;
};

export type VesselContactMatch = {
  contactId: string;
  matchedValue: string;
  matchedRole: MatchedRole;
  matchedSource: MatchSource;
  confidence: MatchConfidence;
  matchedCompanies: MatchCompany[];
};

export type ContactMatchSignals = {
  emails: string[];
  emailDomains: string[];
  websiteDomains: string[];
  companyName: string | null;
};

export type VesselMatchSignals = {
  exactEmails: Array<{ value: string; company: MatchCompany }>;
  companyWebsiteDomains: Array<{ value: string; company: MatchCompany }>;
  vesselEmailDomains: Array<{ value: string; company: MatchCompany }>;
  companyNames: Array<{ value: string; company: MatchCompany }>;
};

const matchConfidenceRank: Record<MatchConfidence, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };
const matchSourceRank: Record<MatchSource, number> = {
  "Exact email": 6,
  "Contact website to company website": 5,
  "Contact email domain to company website": 4,
  "Contact website to vessel email domain": 3,
  "Contact email domain to vessel email domain": 2,
  "Company name": 1,
};

function vesselContactMatchRank(match: VesselContactMatch) {
  return matchConfidenceRank[match.confidence] * 10 + matchSourceRank[match.matchedSource];
}

function bestVesselContactMatch(existing: VesselContactMatch | undefined, candidate: VesselContactMatch) {
  if (!existing || vesselContactMatchRank(candidate) > vesselContactMatchRank(existing)) return candidate;
  if (vesselContactMatchRank(candidate) < vesselContactMatchRank(existing)) return existing;

  const matchedCompanies = [...existing.matchedCompanies];
  for (const company of candidate.matchedCompanies) {
    if (!matchedCompanies.some((c) => c.id === company.id && c.role === company.role)) {
      matchedCompanies.push(company);
    }
  }
  return { ...existing, matchedCompanies };
}

function relationMatchCompany(role: MatchedRole, company: CompanyMatchInput | null): MatchCompany | null {
  if (!company) return null;
  return { id: company.id, role, companyName: company.companyName, website: company.website, country: company.country };
}

function syntheticMatchCompany(
  vesselId: string,
  role: MatchedRole,
  idSuffix: string,
  companyName: string | null,
  country: string | null,
): MatchCompany {
  return { id: `vessel:${vesselId}:${idSuffix}`, role, companyName: companyName ?? role, website: null, country };
}

function vesselCompanyWebsiteEntries(vessel: VesselMatchInput) {
  return [
    relationMatchCompany("Ship Owner", vessel.shipOwnerCompany),
    relationMatchCompany("ISM Manager", vessel.ismManagerCompany),
    relationMatchCompany("Commercial Manager", vessel.commercialManagerCompany),
  ].filter((company): company is MatchCompany => Boolean(company));
}

function vesselEmailEntries(vessel: VesselMatchInput) {
  return [
    { email: vessel.shipOwnerCompany?.email ?? null, company: relationMatchCompany("Ship Owner", vessel.shipOwnerCompany) },
    { email: vessel.ismManagerCompany?.email ?? null, company: relationMatchCompany("ISM Manager", vessel.ismManagerCompany) },
    {
      email: vessel.commercialManagerCompany?.email ?? null,
      company: relationMatchCompany("Commercial Manager", vessel.commercialManagerCompany),
    },
    {
      email: vessel.commercialManagerEmail,
      company: syntheticMatchCompany(
        vessel.id,
        "Commercial Manager",
        "commercial-manager",
        vessel.commercialManagerName,
        vessel.commercialManagerCountry,
      ),
    },
    {
      email: vessel.registeredOwnerEmail,
      company: syntheticMatchCompany(vessel.id, "Registered Owner", "registered-owner", vessel.registeredOwnerName, vessel.registeredOwnerCountry),
    },
    {
      email: vessel.beneficialOwnerEmail,
      company: syntheticMatchCompany(
        vessel.id,
        "Beneficial Owner",
        "beneficial-owner",
        vessel.beneficialOwnerName,
        vessel.beneficialOwnerCountry,
      ),
    },
    {
      email: vessel.technicalManagerEmail,
      company: syntheticMatchCompany(
        vessel.id,
        "Technical Manager",
        "technical-manager",
        vessel.technicalManagerName,
        vessel.technicalManagerCountry,
      ),
    },
    {
      email: vessel.ismManagerEmail,
      company: syntheticMatchCompany(vessel.id, "ISM Manager", "ism-manager", vessel.ismManagerName, vessel.ismManagerCountry),
    },
    {
      email: vessel.operatorEmail,
      company: syntheticMatchCompany(vessel.id, "Operator", "operator", vessel.operatorName, vessel.operatorCountry),
    },
  ].filter((entry): entry is { email: string; company: MatchCompany } => Boolean(entry.email && entry.company));
}

function vesselCompanyNameEntries(vessel: VesselMatchInput) {
  const entries = vesselCompanyWebsiteEntries(vessel);
  entries.push(
    syntheticMatchCompany(
      vessel.id,
      "Commercial Manager",
      "commercial-manager-name",
      vessel.commercialManagerName,
      vessel.commercialManagerCountry,
    ),
    syntheticMatchCompany(vessel.id, "Registered Owner", "registered-owner-name", vessel.registeredOwnerName, vessel.registeredOwnerCountry),
    syntheticMatchCompany(
      vessel.id,
      "Beneficial Owner",
      "beneficial-owner-name",
      vessel.beneficialOwnerName,
      vessel.beneficialOwnerCountry,
    ),
    syntheticMatchCompany(
      vessel.id,
      "Technical Manager",
      "technical-manager-name",
      vessel.technicalManagerName,
      vessel.technicalManagerCountry,
    ),
    syntheticMatchCompany(vessel.id, "ISM Manager", "ism-manager-name", vessel.ismManagerName, vessel.ismManagerCountry),
    syntheticMatchCompany(vessel.id, "Operator", "operator-name", vessel.operatorName, vessel.operatorCountry),
  );
  return entries.filter((entry) => normalizeCompanyName(entry.companyName));
}

export function getContactMatchSignals(contact: ContactMatchInput): ContactMatchSignals {
  return {
    emails: [...new Set([...extractEmailAddresses(contact.email), ...extractEmailAddresses(contact.secondaryEmail)])],
    emailDomains: [
      ...new Set([...extractBusinessEmailDomains(contact.email), ...extractBusinessEmailDomains(contact.secondaryEmail)]),
    ],
    websiteDomains: extractWebsiteDomains(contact.website),
    companyName: normalizeCompanyName(contact.companyName),
  };
}

export function getVesselMatchSignals(vessel: VesselMatchInput): VesselMatchSignals {
  const exactEmails = vesselEmailEntries(vessel).flatMap((entry) =>
    extractEmailAddresses(entry.email).map((value) => ({ value, company: entry.company })),
  );
  const companyWebsiteDomains = vesselCompanyWebsiteEntries(vessel).flatMap((company) =>
    extractWebsiteDomains(company.website).map((value) => ({ value, company })),
  );
  const vesselEmailDomains = vesselEmailEntries(vessel).flatMap((entry) =>
    extractBusinessEmailDomains(entry.email).map((value) => ({ value, company: entry.company })),
  );
  const companyNames = vesselCompanyNameEntries(vessel)
    .map((company) => {
      const value = normalizeCompanyName(company.companyName);
      return value ? { value, company } : null;
    })
    .filter((entry): entry is { value: string; company: MatchCompany } => Boolean(entry));

  return { exactEmails, companyWebsiteDomains, vesselEmailDomains, companyNames };
}

function vesselContactMatchCandidate(
  contact: ContactMatchInput,
  matchedValue: string,
  matchedCompany: MatchCompany,
  matchedSource: MatchSource,
  confidence: MatchConfidence,
): VesselContactMatch {
  return {
    contactId: contact.id,
    matchedValue,
    matchedRole: matchedCompany.role,
    matchedSource,
    confidence,
    matchedCompanies: [matchedCompany],
  };
}

export function matchContactToVessel(contact: ContactMatchInput, vessel: VesselMatchInput) {
  let best: VesselContactMatch | undefined;
  const signals = getContactMatchSignals(contact);
  const contactEmails = new Set(signals.emails);
  const contactEmailDomains = new Set(signals.emailDomains);
  const contactWebsiteDomains = new Set(signals.websiteDomains);
  const contactCompanyName = signals.companyName;

  for (const entry of vesselEmailEntries(vessel)) {
    for (const email of extractEmailAddresses(entry.email)) {
      if (contactEmails.has(email)) {
        best = bestVesselContactMatch(best, vesselContactMatchCandidate(contact, email, entry.company, "Exact email", "HIGH"));
      }
    }
  }

  for (const company of vesselCompanyWebsiteEntries(vessel)) {
    for (const domain of extractWebsiteDomains(company.website)) {
      if (contactWebsiteDomains.has(domain)) {
        best = bestVesselContactMatch(
          best,
          vesselContactMatchCandidate(contact, domain, company, "Contact website to company website", "HIGH"),
        );
      }
      if (contactEmailDomains.has(domain)) {
        best = bestVesselContactMatch(
          best,
          vesselContactMatchCandidate(contact, domain, company, "Contact email domain to company website", "HIGH"),
        );
      }
    }
  }

  for (const entry of vesselEmailEntries(vessel)) {
    for (const domain of extractBusinessEmailDomains(entry.email)) {
      if (contactWebsiteDomains.has(domain)) {
        best = bestVesselContactMatch(
          best,
          vesselContactMatchCandidate(contact, domain, entry.company, "Contact website to vessel email domain", "MEDIUM"),
        );
      }
      if (contactEmailDomains.has(domain)) {
        best = bestVesselContactMatch(
          best,
          vesselContactMatchCandidate(contact, domain, entry.company, "Contact email domain to vessel email domain", "MEDIUM"),
        );
      }
    }
  }

  if (contactCompanyName) {
    for (const company of vesselCompanyNameEntries(vessel)) {
      if (normalizeCompanyName(company.companyName) === contactCompanyName) {
        best = bestVesselContactMatch(best, vesselContactMatchCandidate(contact, contactCompanyName, company, "Company name", "LOW"));
      }
    }
  }

  return best ?? null;
}

export function matchVesselContacts(contacts: ContactMatchInput[], vessel: VesselMatchInput) {
  return contacts
    .map((contact) => matchContactToVessel(contact, vessel))
    .filter((match): match is VesselContactMatch => Boolean(match))
    .sort((a, b) => vesselContactMatchRank(b) - vesselContactMatchRank(a) || a.matchedValue.localeCompare(b.matchedValue));
}

type JsonWhere = Record<string, unknown>;

const vesselFieldMap: Record<string, string> = {
  vesselName: "vesselName",
  imoNumber: "imoNumber",
  mmsi: "mmsi",
  callsign: "callsign",
  flag: "flag",
  vesselType: "vesselType",
  globalArea: "globalArea",
  eni: "eni",
  speed: "speed",
  course: "course",
  draught: "draught",
  navigationalStatus: "navigationalStatus",
  destination: "destination",
  aisClass: "aisClass",
  dwt: "dwt",
  grossTonnage: "grossTonnage",
  netTonnage: "netTonnage",
  builtYear: "builtYear",
  lengthOverall: "lengthOverall",
  breadth: "breadth",
  width: "width",
  draughtMax: "draughtMax",
  draughtMin: "draughtMin",
  yardNumber: "yardNumber",
  vesselTypeDetailed: "vesselTypeDetailed",
  capacityDwt: "capacityDwt",
  capacityGt: "capacityGt",
  capacityTeu: "capacityTeu",
  capacityLiquidGas: "capacityLiquidGas",
  capacityPassengers: "capacityPassengers",
  lengthBetweenPerpendiculars: "lengthBetweenPerpendiculars",
  depth: "depth",
  breadthExtreme: "breadthExtreme",
  capacityLiquidOil: "capacityLiquidOil",
  commercialMarket: "commercialMarket",
  commercialSizeClass: "commercialSizeClass",
  firstAisPositionDate: "firstAisPositionDate",
  currentPortUnlocode: "currentPortUnlocode",
  currentPortCountry: "currentPortCountry",
  commercialManagerName: "commercialManagerName",
  commercialManagerEmail: "commercialManagerEmail",
  commercialManagerCity: "commercialManagerCity",
  commercialManagerCountry: "commercialManagerCountry",
  registeredOwnerName: "registeredOwnerName",
  registeredOwnerEmail: "registeredOwnerEmail",
  registeredOwnerCity: "registeredOwnerCity",
  registeredOwnerCountry: "registeredOwnerCountry",
  beneficialOwnerName: "beneficialOwnerName",
  beneficialOwnerEmail: "beneficialOwnerEmail",
  beneficialOwnerCity: "beneficialOwnerCity",
  beneficialOwnerCountry: "beneficialOwnerCountry",
  technicalManagerName: "technicalManagerName",
  technicalManagerEmail: "technicalManagerEmail",
  technicalManagerCity: "technicalManagerCity",
  technicalManagerCountry: "technicalManagerCountry",
  pAndIClubName: "pAndIClubName",
  pAndIClubEmail: "pAndIClubEmail",
  pAndIClubCity: "pAndIClubCity",
  pAndIClubCountry: "pAndIClubCountry",
  shipBuilderName: "shipBuilderName",
  shipBuilderEmail: "shipBuilderEmail",
  shipBuilderCity: "shipBuilderCity",
  shipBuilderCountry: "shipBuilderCountry",
  classSocietyName: "classSocietyName",
  classSocietyEmail: "classSocietyEmail",
  classSocietyCity: "classSocietyCity",
  classSocietyCountry: "classSocietyCountry",
  engineBuilderName: "engineBuilderName",
  engineBuilderEmail: "engineBuilderEmail",
  engineBuilderCity: "engineBuilderCity",
  engineBuilderCountry: "engineBuilderCountry",
  ismManagerName: "ismManagerName",
  ismManagerEmail: "ismManagerEmail",
  ismManagerCity: "ismManagerCity",
  ismManagerCountry: "ismManagerCountry",
  operatorName: "operatorName",
  operatorEmail: "operatorEmail",
  operatorCity: "operatorCity",
  operatorCountry: "operatorCountry",
  draft: "draft",
  classificationSociety: "classificationSociety",
  status: "status",
  verified: "verified",
  source: "source",
};

const contactFieldMap: Record<string, string> = {
  firstName: "firstName",
  lastName: "lastName",
  email: "email",
  secondaryEmail: "secondaryEmail",
  title: "title",
  companyName: "companyName",
  companyType: "companyKind",
  contactOwnerName: "contactOwnerName",
  homePhone: "homePhone",
  mobilePhone: "mobilePhone",
  corporatePhone: "corporatePhone",
  otherPhone: "otherPhone",
  companyCountry: "country",
  linkedinUrl: "personLinkedinUrl",
  personLinkedinUrl: "personLinkedinUrl",
  website: "website",
  companyLinkedinUrl: "companyLinkedinUrl",
  salesforceId: "salesforceId",
  seniority: "seniority",
  marineRole: "marineRole",
  emailStatus: "emailStatus",
  engagementScore: "engagementScore",
  country: "country",
  subsidiaryOf: "subsidiaryOf",
  source: "source",
  verified: "verified",
};

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [value].filter((item) => item !== undefined && item !== null);
}

function comparableCondition(field: string, operator: string, value: unknown): JsonWhere {
  switch (operator) {
    case "equals":
    case "eq":
      return { [field]: value };
    case "not_equals":
    case "neq":
      return { [field]: { not: value } };
    case "contains":
      return { [field]: { contains: String(value ?? ""), mode: "insensitive" } };
    case "not_contains":
      return { [field]: { not: { contains: String(value ?? ""), mode: "insensitive" } } };
    case "starts_with":
      return { [field]: { startsWith: String(value ?? ""), mode: "insensitive" } };
    case "ends_with":
      return { [field]: { endsWith: String(value ?? ""), mode: "insensitive" } };
    case "ends_with_domain":
      return { [field]: { endsWith: String(value ?? "").replace(/^@/, ""), mode: "insensitive" } };
    case "is_any_of":
    case "in":
      return { [field]: { in: arrayValue(value) } };
    case "is_none_of":
    case "not_in":
      return { [field]: { notIn: arrayValue(value) } };
    case "greater_than":
    case "gt":
      return { [field]: { gt: value } };
    case "less_than":
    case "lt":
      return { [field]: { lt: value } };
    case "gte":
      return { [field]: { gte: value } };
    case "lte":
      return { [field]: { lte: value } };
    case "between": {
      const [gte, lte] = arrayValue(value);
      return { [field]: { gte, lte } };
    }
    case "is_empty":
      return { OR: [{ [field]: null }, { [field]: "" }] };
    case "is_not_empty":
      return { AND: [{ [field]: { not: null } }, { [field]: { not: "" } }] };
    default:
      return {};
  }
}

function arrayCondition(field: string, operator: string, value: unknown): JsonWhere {
  switch (operator) {
    case "includes_any_of":
      return { [field]: { hasSome: arrayValue(value) } };
    case "includes_all_of":
      return { [field]: { hasEvery: arrayValue(value) } };
    case "excludes":
      return { NOT: { [field]: { hasSome: arrayValue(value) } } };
    case "is_empty":
      return { [field]: { isEmpty: true } };
    case "is_not_empty":
      return { NOT: { [field]: { isEmpty: true } } };
    default:
      return {};
  }
}

function vesselConditionToWhere(condition: FilterCondition): JsonWhere {
  const { field, operator, value } = condition;

  if (field === "hasShipOwnerEmail") {
    return value === true
      ? { shipOwnerCompany: { email: { not: null } } }
      : { OR: [{ shipOwnerCompany: null }, { shipOwnerCompany: { email: null } }] };
  }

  if (field === "hasISMManagerEmail") {
    return value === true
      ? { ismManagerCompany: { email: { not: null } } }
      : { OR: [{ ismManagerCompany: null }, { ismManagerCompany: { email: null } }] };
  }

  if (field === "hasCommercialManagerEmail") {
    return value === true
      ? { commercialManagerCompany: { email: { not: null } } }
      : { OR: [{ commercialManagerCompany: null }, { commercialManagerCompany: { email: null } }] };
  }

  if (field === "shipOwnerCountry") {
    return { shipOwnerCompany: comparableCondition("country", operator, value) };
  }

  if (field === "ismManagerCountry") {
    return { ismManagerCompany: comparableCondition("country", operator, value) };
  }

  if (field === "commercialManagerCountry") {
    return { commercialManagerCompany: comparableCondition("country", operator, value) };
  }

  if (field === "shipOwnerCompany") {
    return { shipOwnerCompany: comparableCondition("companyName", operator, value) };
  }

  if (field === "ismManagerCompany") {
    return { ismManagerCompany: comparableCondition("companyName", operator, value) };
  }

  if (field === "commercialManagerCompany") {
    return { commercialManagerCompany: comparableCondition("companyName", operator, value) };
  }

  const mappedField = vesselFieldMap[field];
  return mappedField ? comparableCondition(mappedField, operator, value) : {};
}

const etaFieldMap: Record<string, string> = {
  destinationPort: "destinationPort",
  destinationPortName: "destinationPortName",
  etaConfidence: "etaConfidence",
  etaSource: "etaSource",
  voyageStatus: "voyageStatus",
  previousPort: "previousPort",
  previousCargo: "previousCargo",
  nextCargo: "nextCargo",
  speedOverGround: "speedOverGround",
  campaignsTriggered: "campaignsTriggered",
};

function endOfUtcDay(date: Date) {
  const next = new Date(date);
  next.setUTCHours(23, 59, 59, 999);
  return next;
}

function startOfUtcDay(date: Date) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function etaConditionToWhere(condition: FilterCondition): JsonWhere {
  const { field, operator, value } = condition;

  if (field === "etaDaysFromNow") {
    const days = Number(value);
    if (!Number.isFinite(days)) return {};
    const now = new Date();
    const upper = new Date(now.getTime() + days * 86_400_000);
    if (operator === "lte" || operator === "within_next_n_days") {
      return { eta: { gte: now, lte: upper } };
    }
    if (operator === "gte") {
      return { eta: { gte: upper } };
    }
    if (operator === "equals" || operator === "eq") {
      const dayStart = startOfUtcDay(upper);
      const dayEnd = endOfUtcDay(upper);
      return { eta: { gte: dayStart, lte: dayEnd } };
    }
    return { eta: { gte: now, lte: upper } };
  }

  if (field === "eta" || field === "etaDate") {
    if (operator === "between" && Array.isArray(value)) {
      const [from, to] = value;
      return { eta: { gte: new Date(String(from)), lte: new Date(String(to)) } };
    }
    if (operator === "after") return { eta: { gte: new Date(String(value)) } };
    if (operator === "before") return { eta: { lte: new Date(String(value)) } };
    if (operator === "within_next_n_days") {
      const days = Number(value);
      if (!Number.isFinite(days)) return {};
      const now = new Date();
      const upper = new Date(now.getTime() + days * 86_400_000);
      return { eta: { gte: now, lte: upper } };
    }
  }

  if (field === "vesselType" || field === "flag" || field === "dwt" || field === "vesselName" || field === "imoNumber") {
    return { vessel: comparableCondition(field, operator, value) };
  }

  if (field === "shipOwnerCountry") {
    return { vessel: { shipOwnerCompany: comparableCondition("country", operator, value) } };
  }

  if (field === "ismManagerCountry") {
    return { vessel: { ismManagerCompany: comparableCondition("country", operator, value) } };
  }

  if (field === "hasShipOwnerEmail") {
    return value === true
      ? { vessel: { shipOwnerCompany: { email: { not: null } } } }
      : { vessel: { OR: [{ shipOwnerCompany: null }, { shipOwnerCompany: { email: null } }] } };
  }

  if (field === "hasISMManagerEmail") {
    return value === true
      ? { vessel: { ismManagerCompany: { email: { not: null } } } }
      : { vessel: { OR: [{ ismManagerCompany: null }, { ismManagerCompany: { email: null } }] } };
  }

  if (field === "region") {
    return { port: comparableCondition("region", operator, value) };
  }

  const mappedField = etaFieldMap[field];
  return mappedField ? comparableCondition(mappedField, operator, value) : {};
}

function contactConditionToWhere(condition: FilterCondition): JsonWhere {
  const { field, operator, value } = condition;

  if (field === "fullName") {
    return {
      OR: [
        comparableCondition("firstName", operator, value),
        comparableCondition("lastName", operator, value),
      ],
    };
  }

  if (field === "keyword") {
    const term = String(value ?? "").trim();
    if (!term) return {};
    const fields = [
      "firstName",
      "lastName",
      "email",
      "secondaryEmail",
      "companyName",
      "title",
      "contactOwnerName",
      "homePhone",
      "mobilePhone",
      "corporatePhone",
      "otherPhone",
      "personLinkedinUrl",
      "website",
      "companyLinkedinUrl",
      "country",
      "subsidiaryOf",
      "salesforceId",
    ];
    return { OR: fields.map((f) => ({ [f]: { contains: term, mode: "insensitive" } })) };
  }

  if (field === "listMembership") {
    const ids = arrayValue(value).map((id) => String(id)).filter(Boolean);
    if (ids.length === 0) return {};
    const some = { listMemberships: { some: { listId: { in: ids } } } };
    return operator === "excludes" ? { NOT: some } : some;
  }

  if (field === "department" || field === "tags") {
    return arrayCondition(field, operator, value);
  }

  if (field === "hasMobilePhone") {
    return value === true ? { mobilePhone: { not: null } } : { mobilePhone: null };
  }

  if (field === "hasCorporatePhone") {
    return value === true ? { corporatePhone: { not: null } } : { corporatePhone: null };
  }

  if (field === "hasHomePhone") {
    return value === true ? { homePhone: { not: null } } : { homePhone: null };
  }

  if (field === "hasAnyPhone") {
    return value === true
      ? { OR: [{ mobilePhone: { not: null } }, { corporatePhone: { not: null } }, { homePhone: { not: null } }, { otherPhone: { not: null } }] }
      : { AND: [{ mobilePhone: null }, { corporatePhone: null }, { homePhone: null }, { otherPhone: null }] };
  }

  if (field === "hasLinkedInProfile" || field === "salesforceSynced") {
    const target = field === "hasLinkedInProfile" ? "personLinkedinUrl" : "salesforceId";
    return value === true ? { [target]: { not: null } } : { [target]: null };
  }

  if (field === "engagementTier") {
    if (value === "HOT") return { engagementScore: { gte: 75 } };
    if (value === "WARM") return { engagementScore: { gte: 40, lt: 75 } };
    if (value === "COLD") return { engagementScore: { gte: 10, lt: 40 } };
    if (value === "INACTIVE") return { engagementScore: { lt: 10 } };
  }

  const mappedField = contactFieldMap[field];
  return mappedField ? comparableCondition(mappedField, operator, value) : {};
}

export function filterConfigToWhereClause(filterConfig: FilterConfig): JsonWhere {
  const groups = filterConfig.groups
    .map((group) => {
      const conditions = group.conditions
        .map((condition) => {
          if (filterConfig.entityType === "VESSEL") {
            return vesselConditionToWhere(condition);
          }
          if (filterConfig.entityType === "CONTACT") {
            return contactConditionToWhere(condition);
          }
          if (filterConfig.entityType === "ETA") {
            return etaConditionToWhere(condition);
          }
          return {};
        })
        .filter((condition) => Object.keys(condition).length > 0);

      return conditions.length > 0 ? { AND: conditions } : {};
    })
    .filter((group) => Object.keys(group).length > 0);

  if (groups.length === 0) {
    return {};
  }

  return filterConfig.groupLogic === "OR" ? { OR: groups } : { AND: groups };
}

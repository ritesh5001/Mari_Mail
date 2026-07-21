import { Prisma, prisma } from "@marimail/db";
import type { ContactModel } from "@/lib/contact-data";
import type { AssociatedVesselView } from "@/lib/marine-row-views";
import {
  getContactMatchSignals,
  getVesselMatchSignals,
  matchContactToVessel,
  matchVesselContacts,
  type MatchCompany,
  type MatchConfidence,
  type MatchedRole,
  type MatchSource,
  type VesselContactMatch,
} from "@/lib/vessel-contact-matcher";

// Per-contact candidate-vessel scan cap for the lazy count-badge endpoint. Keeps
// a single contact's fan-out bounded so the counts route can't do unbounded work.
const ASSOCIATION_COUNT_SCAN_CAP = 200;

export const associationCompanySelect = {
  id: true,
  companyName: true,
  phone: true,
  email: true,
  website: true,
  country: true,
} as const;

export const associationVesselInclude = {
  shipOwnerCompany: { select: associationCompanySelect },
  ismManagerCompany: { select: associationCompanySelect },
  commercialManagerCompany: { select: associationCompanySelect },
} as const;

export type AssociationVessel = Prisma.VesselGetPayload<{ include: typeof associationVesselInclude }>;

type ContactForAssociation = Pick<
  ContactModel,
  | "id"
  | "firstName"
  | "lastName"
  | "title"
  | "email"
  | "secondaryEmail"
  | "website"
  | "companyName"
  | "companyId"
  | "companyKind"
  | "country"
>;

type ContactMatchIndex = {
  contactsById: Map<string, ContactForAssociation>;
  emails: Map<string, Set<string>>;
  emailDomains: Map<string, Set<string>>;
  websiteDomains: Map<string, Set<string>>;
  companyNames: Map<string, Set<string>>;
};

export type AssociatedContactRow = {
  contact: ContactModel;
  match: VesselContactMatch;
  matchedCompanies: MatchCompany[];
};

export type AssociatedVesselRow = {
  vessel: AssociationVessel;
  match: VesselContactMatch;
  matchedCompanies: MatchCompany[];
};

export function workspaceScope(workspaceId: string) {
  return { OR: [{ workspaceId }, { workspaceId: null }] };
}

function addIndexValue(index: Map<string, Set<string>>, value: string | null | undefined, contactId: string) {
  if (!value) return;
  const set = index.get(value) ?? new Set<string>();
  set.add(contactId);
  index.set(value, set);
}

export function buildContactMatchIndex(contacts: ContactForAssociation[]): ContactMatchIndex {
  const index: ContactMatchIndex = {
    contactsById: new Map(contacts.map((contact) => [contact.id, contact])),
    emails: new Map(),
    emailDomains: new Map(),
    websiteDomains: new Map(),
    companyNames: new Map(),
  };

  for (const contact of contacts) {
    const signals = getContactMatchSignals(contact);
    for (const value of signals.emails) addIndexValue(index.emails, value, contact.id);
    for (const value of signals.emailDomains) addIndexValue(index.emailDomains, value, contact.id);
    for (const value of signals.websiteDomains) addIndexValue(index.websiteDomains, value, contact.id);
    addIndexValue(index.companyNames, signals.companyName, contact.id);
  }

  return index;
}

export function candidateContactsForVessel(vessel: AssociationVessel, index: ContactMatchIndex) {
  const signals = getVesselMatchSignals(vessel);
  const ids = new Set<string>();
  const addMatches = (lookup: Map<string, Set<string>>, value: string) => {
    const contactIds = lookup.get(value);
    if (!contactIds) return;
    for (const id of contactIds) ids.add(id);
  };

  for (const signal of signals.exactEmails) addMatches(index.emails, signal.value);
  for (const signal of signals.companyWebsiteDomains) {
    addMatches(index.websiteDomains, signal.value);
    addMatches(index.emailDomains, signal.value);
  }
  for (const signal of signals.vesselEmailDomains) {
    addMatches(index.websiteDomains, signal.value);
    addMatches(index.emailDomains, signal.value);
  }
  for (const signal of signals.companyNames) addMatches(index.companyNames, signal.value);

  return Array.from(ids)
    .map((id) => index.contactsById.get(id))
    .filter((contact): contact is ContactForAssociation => Boolean(contact));
}

export function collectVesselSignals(vessels: AssociationVessel[]) {
  const domains = new Set<string>();
  const companyNames = new Set<string>();
  const emails = new Set<string>();
  for (const vessel of vessels) {
    const signals = getVesselMatchSignals(vessel);
    for (const signal of signals.companyWebsiteDomains) domains.add(signal.value);
    for (const signal of signals.vesselEmailDomains) domains.add(signal.value);
    for (const signal of signals.companyNames) companyNames.add(signal.value);
    for (const signal of signals.exactEmails) emails.add(signal.value);
  }
  return { domains, companyNames, emails };
}

export async function listContactsForVessels(
  workspaceId: string,
  vessels: AssociationVessel[],
): Promise<ContactModel[]> {
  if (vessels.length === 0) return [];
  const { domains, companyNames, emails } = collectVesselSignals(vessels);

  const or: Prisma.ContactWhereInput[] = [];
  if (companyNames.size > 0) or.push({ companyName: { in: Array.from(companyNames) } });
  for (const email of emails) {
    or.push({ email: { equals: email, mode: "insensitive" } });
    or.push({ secondaryEmail: { equals: email, mode: "insensitive" } });
  }
  for (const domain of domains) {
    const suffix = `@${domain}`;
    or.push({ email: { endsWith: suffix, mode: "insensitive" } });
    or.push({ secondaryEmail: { endsWith: suffix, mode: "insensitive" } });
    or.push({ website: { contains: domain, mode: "insensitive" } });
  }
  if (or.length === 0) return [];

  return prisma.contact.findMany({
    where: { AND: [workspaceScope(workspaceId), { OR: or }] },
    orderBy: [{ companyName: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
  });
}

export function associatedContactRowsForVessels(vessels: AssociationVessel[], contacts: ContactModel[]) {
  const index = buildContactMatchIndex(contacts);
  const rowsByVessel = new Map<string, AssociatedContactRow[]>();

  for (const vessel of vessels) {
    const candidates = candidateContactsForVessel(vessel, index);
    const matchesByContact = new Map(
      matchVesselContacts(candidates, vessel).map((match) => [match.contactId, match]),
    );
    const rows = candidates
      .map((contact) => {
        const match = matchesByContact.get(contact.id);
        return match ? { contact: contact as ContactModel, match, matchedCompanies: match.matchedCompanies } : null;
      })
      .filter((row): row is AssociatedContactRow => Boolean(row));
    rowsByVessel.set(vessel.id, rows);
  }

  return rowsByVessel;
}

export async function countAssociatedContactsForVessels(workspaceId: string, vessels: AssociationVessel[]) {
  const contacts = await listContactsForVessels(workspaceId, vessels);
  const rowsByVessel = associatedContactRowsForVessels(vessels, contacts);
  return new Map(vessels.map((vessel) => [vessel.id, rowsByVessel.get(vessel.id)?.length ?? 0]));
}

export async function listAssociatedContactsForVessel(
  workspaceId: string,
  vesselId: string,
): Promise<AssociatedContactRow[] | null> {
  // Vessel lookup is unscoped because global (admin-authored) ETAs on Port
  // Radar can reference vessels from any workspace. The associated-contacts
  // response is still workspace-filtered downstream via listContactsForVessels
  // (which only looks at contacts in this workspace), so cross-workspace
  // contact data doesn't leak — we just allow reading public vessel details
  // for the row expansion.
  const vessel = await prisma.vessel.findUnique({
    where: { id: vesselId },
    include: associationVesselInclude,
  });
  if (!vessel) return null;

  const contacts = await listContactsForVessels(workspaceId, [vessel]);
  return associatedContactRowsForVessels([vessel], contacts).get(vessel.id) ?? [];
}

function companyForRole(vessel: AssociationVessel, role: MatchedRole): MatchCompany | null {
  if (role === "Ship Owner" && vessel.shipOwnerCompany) {
    return { ...vessel.shipOwnerCompany, role, website: vessel.shipOwnerCompany.website, country: vessel.shipOwnerCompany.country };
  }
  if (role === "ISM Manager" && vessel.ismManagerCompany) {
    return { ...vessel.ismManagerCompany, role, website: vessel.ismManagerCompany.website, country: vessel.ismManagerCompany.country };
  }
  if (role === "Commercial Manager" && vessel.commercialManagerCompany) {
    return {
      ...vessel.commercialManagerCompany,
      role,
      website: vessel.commercialManagerCompany.website,
      country: vessel.commercialManagerCompany.country,
    };
  }
  return null;
}

function fallbackCompanyMatch(contact: ContactForAssociation, vessel: AssociationVessel): VesselContactMatch | null {
  let role: MatchedRole | null = null;
  if (contact.companyKind === "SHIP_OWNER" && vessel.shipOwnerCompanyId === contact.companyId) role = "Ship Owner";
  if (contact.companyKind === "ISM_MANAGER" && vessel.ismManagerCompanyId === contact.companyId) role = "ISM Manager";
  if (contact.companyKind === "COMMERCIAL_MANAGER" && vessel.commercialManagerCompanyId === contact.companyId) role = "Commercial Manager";
  if (!role) return null;

  const company = companyForRole(vessel, role);
  return {
    contactId: contact.id,
    matchedValue: contact.companyName ?? company?.companyName ?? contact.companyId ?? "Linked company",
    matchedRole: role,
    matchedSource: "Company name",
    confidence: "LOW",
    matchedCompanies: company ? [company] : [],
  };
}

export function matchContactToVesselWithFallback(contact: ContactForAssociation, vessel: AssociationVessel) {
  return matchContactToVessel(contact, vessel) ?? fallbackCompanyMatch(contact, vessel);
}

function vesselCandidateWhereForContact(contact: ContactForAssociation): Prisma.VesselWhereInput[] {
  const signals = getContactMatchSignals(contact);
  const or: Prisma.VesselWhereInput[] = [];

  for (const email of signals.emails) {
    or.push({ commercialManagerEmail: { equals: email, mode: "insensitive" } });
    or.push({ registeredOwnerEmail: { equals: email, mode: "insensitive" } });
    or.push({ beneficialOwnerEmail: { equals: email, mode: "insensitive" } });
    or.push({ technicalManagerEmail: { equals: email, mode: "insensitive" } });
    or.push({ ismManagerEmail: { equals: email, mode: "insensitive" } });
    or.push({ operatorEmail: { equals: email, mode: "insensitive" } });
    or.push({ shipOwnerCompany: { email: { equals: email, mode: "insensitive" } } });
    or.push({ ismManagerCompany: { email: { equals: email, mode: "insensitive" } } });
    or.push({ commercialManagerCompany: { email: { equals: email, mode: "insensitive" } } });
  }

  for (const domain of [...signals.emailDomains, ...signals.websiteDomains]) {
    const suffix = `@${domain}`;
    or.push({ commercialManagerEmail: { endsWith: suffix, mode: "insensitive" } });
    or.push({ registeredOwnerEmail: { endsWith: suffix, mode: "insensitive" } });
    or.push({ beneficialOwnerEmail: { endsWith: suffix, mode: "insensitive" } });
    or.push({ technicalManagerEmail: { endsWith: suffix, mode: "insensitive" } });
    or.push({ ismManagerEmail: { endsWith: suffix, mode: "insensitive" } });
    or.push({ operatorEmail: { endsWith: suffix, mode: "insensitive" } });
    or.push({ shipOwnerCompany: { email: { endsWith: suffix, mode: "insensitive" } } });
    or.push({ ismManagerCompany: { email: { endsWith: suffix, mode: "insensitive" } } });
    or.push({ commercialManagerCompany: { email: { endsWith: suffix, mode: "insensitive" } } });
    or.push({ shipOwnerCompany: { website: { contains: domain, mode: "insensitive" } } });
    or.push({ ismManagerCompany: { website: { contains: domain, mode: "insensitive" } } });
    or.push({ commercialManagerCompany: { website: { contains: domain, mode: "insensitive" } } });
  }

  if (contact.companyName) {
    const text = { contains: contact.companyName, mode: "insensitive" as const };
    or.push({ commercialManagerName: text });
    or.push({ registeredOwnerName: text });
    or.push({ beneficialOwnerName: text });
    or.push({ technicalManagerName: text });
    or.push({ ismManagerName: text });
    or.push({ operatorName: text });
    or.push({ shipOwnerCompany: { companyName: text } });
    or.push({ ismManagerCompany: { companyName: text } });
    or.push({ commercialManagerCompany: { companyName: text } });
  }

  if (contact.companyId && contact.companyKind === "SHIP_OWNER") or.push({ shipOwnerCompanyId: contact.companyId });
  if (contact.companyId && contact.companyKind === "ISM_MANAGER") or.push({ ismManagerCompanyId: contact.companyId });
  if (contact.companyId && contact.companyKind === "COMMERCIAL_MANAGER") or.push({ commercialManagerCompanyId: contact.companyId });

  return or;
}

export async function listAssociatedVesselsForContact(
  workspaceId: string,
  contactId: string,
): Promise<AssociatedVesselRow[] | null> {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, ...workspaceScope(workspaceId) } });
  if (!contact) return null;

  const or = vesselCandidateWhereForContact(contact);
  const vessels = or.length === 0
    ? []
    : await prisma.vessel.findMany({
        where: { AND: [workspaceScope(workspaceId), { OR: or }] },
        include: associationVesselInclude,
        orderBy: { vesselName: "asc" },
      });

  return vessels
    .map((vessel) => {
      const match = matchContactToVesselWithFallback(contact, vessel);
      return match ? { vessel, match, matchedCompanies: match.matchedCompanies } : null;
    })
    .filter((row): row is AssociatedVesselRow => Boolean(row));
}

export async function countAssociatedVesselsForContacts(workspaceId: string, contactIds: string[]) {
  const contacts = await prisma.contact.findMany({
    where: { AND: [workspaceScope(workspaceId), { id: { in: contactIds } }] },
  });
  const counts = new Map<string, number>(contactIds.map((id) => [id, 0]));

  // This runs one candidate scan per contact (badge counts for the contacts
  // list, fetched lazily after page load — not on the SSR critical path). Cap
  // each scan with `take` so a contact whose company owns thousands of vessels
  // can't pull them all just to render a count badge; the badge only needs an
  // indicative number, and the cap bounds the total work to N×200 rows.
  await Promise.all(
    contacts.map(async (contact) => {
      const or = vesselCandidateWhereForContact(contact);
      if (or.length === 0) return;
      const vessels = await prisma.vessel.findMany({
        where: { AND: [workspaceScope(workspaceId), { OR: or }] },
        include: associationVesselInclude,
        take: ASSOCIATION_COUNT_SCAN_CAP,
      });
      const count = vessels.reduce((total, vessel) => {
        return total + (matchContactToVesselWithFallback(contact, vessel) ? 1 : 0);
      }, 0);
      counts.set(contact.id, count);
    }),
  );

  return counts;
}

export function associationSummaryFromMatches(matches: VesselContactMatch[]) {
  return {
    associatedContactCount: matches.length,
    matchedValues: Array.from(new Set(matches.map((match) => match.matchedValue))).sort(),
    matchedRoles: Array.from(new Set(matches.map((match) => match.matchedRole))).sort() as MatchedRole[],
    matchedSources: Array.from(new Set(matches.map((match) => match.matchedSource))).sort() as MatchSource[],
    matchConfidences: Array.from(new Set(matches.map((match) => match.confidence))).sort() as MatchConfidence[],
  };
}

export function toAssociatedVesselView(row: AssociatedVesselRow): AssociatedVesselView {
  const vessel = row.vessel;
  return {
    vesselId: vessel.id,
    imoNumber: vessel.imoNumber,
    vesselName: vessel.vesselName,
    vesselType: vessel.vesselType,
    flag: vessel.flag,
    dwt: vessel.dwt,
    currentPortUnlocode: vessel.currentPortUnlocode,
    commercialManagerName: vessel.commercialManagerName,
    ismManagerName: vessel.ismManagerName,
    operatorName: vessel.operatorName,
    matchedValue: row.match.matchedValue,
    matchedRole: row.match.matchedRole,
    matchedSource: row.match.matchedSource,
    confidence: row.match.confidence,
    matchedCompanies: row.matchedCompanies.map((company) => ({
      companyName: company.companyName,
      role: company.role,
    })),
  };
}

import { notFound } from "next/navigation";
import { Prisma, prisma } from "@marimail/db";
import { filterConfigToWhereClause } from "@marimail/utils";
import type { FilterConfig } from "@marimail/types";
import { getServerSession } from "@/lib/api";
import { matchContactToVessel } from "@/lib/vessel-contact-matcher";
import {
  listAssociatedVesselsForContact,
  toAssociatedVesselView,
} from "@/lib/association-data";
import { enrichApolloContactsWithCachedWebsite } from "@/lib/apollo-contact-enrichment";

export type ContactModel = Prisma.ContactGetPayload<Record<string, never>>;
export type ContactListModel = Prisma.ContactListGetPayload<Record<string, never>> & {
  // Added by `listContactLists` so callers can infer legacy list kind.
  // Optional so `getContactListDetail` (which doesn't populate this) still fits.
  vesselCount?: number;
};
type CompanyKindString = "SHIP_OWNER" | "ISM_MANAGER" | "COMMERCIAL_MANAGER" | "GENERIC";

// Upper bounds for the contact-list detail loaders so a huge SMART filter or a
// company with thousands of vessels can't pull an unbounded result set into the
// server render. Generous enough to cover any real list; the UI paginates/scrolls.
const CONTACT_LIST_MAX = 500;
const VESSEL_LIST_MAX = 500;

function scope(workspaceId: string) {
  return { OR: [{ workspaceId }, { workspaceId: null }] };
}

function vesselWhereForCompanyLink(companyId: string | null, companyKind: string | null): Prisma.VesselWhereInput | null {
  if (!companyId) return null;
  if (companyKind === "SHIP_OWNER") return { shipOwnerCompanyId: companyId };
  if (companyKind === "ISM_MANAGER") return { ismManagerCompanyId: companyId };
  if (companyKind === "COMMERCIAL_MANAGER") return { commercialManagerCompanyId: companyId };
  return null;
}

export async function findVesselsAssociatedToContactByDomain(contact: ContactModel, workspaceId: string) {
  const companySelect = {
    id: true,
    companyName: true,
    email: true,
    website: true,
    country: true,
  } as const;
  const fallbackLink = vesselWhereForCompanyLink(contact.companyId, contact.companyKind);

  const vessels = await prisma.vessel.findMany({
    where: scope(workspaceId),
    include: {
      shipOwnerCompany: { select: companySelect },
      ismManagerCompany: { select: companySelect },
      commercialManagerCompany: { select: companySelect },
    },
    orderBy: { vesselName: "asc" },
  });

  return vessels.filter((vessel) => {
    if (matchContactToVessel(contact, vessel)) return true;
    if (!fallbackLink) return false;
    return (
      (contact.companyKind === "SHIP_OWNER" && vessel.shipOwnerCompanyId === contact.companyId) ||
      (contact.companyKind === "ISM_MANAGER" && vessel.ismManagerCompanyId === contact.companyId) ||
      (contact.companyKind === "COMMERCIAL_MANAGER" && vessel.commercialManagerCompanyId === contact.companyId)
    );
  });
}

export async function requireContactWorkspaceId() {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    notFound();
  }
  return { workspaceId: session.activeWorkspace.id, userId: session.user.id };
}

export async function listContacts(searchParams: Record<string, string | string[] | undefined>) {
  const { workspaceId } = await requireContactWorkspaceId();
  const q = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const department = typeof searchParams.department === "string" ? searchParams.department.trim() : "";
  const marineRole = typeof searchParams.marineRole === "string" ? searchParams.marineRole.trim() : "";
  const emailStatus = typeof searchParams.emailStatus === "string" ? searchParams.emailStatus.trim() : "";

  const where: Prisma.ContactWhereInput = {
    AND: [
      scope(workspaceId),
      q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { secondaryEmail: { contains: q, mode: "insensitive" } },
              { companyName: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
              { contactOwnerName: { contains: q, mode: "insensitive" } },
              { homePhone: { contains: q, mode: "insensitive" } },
              { mobilePhone: { contains: q, mode: "insensitive" } },
              { corporatePhone: { contains: q, mode: "insensitive" } },
              { otherPhone: { contains: q, mode: "insensitive" } },
              { personLinkedinUrl: { contains: q, mode: "insensitive" } },
              { website: { contains: q, mode: "insensitive" } },
              { companyLinkedinUrl: { contains: q, mode: "insensitive" } },
              { country: { contains: q, mode: "insensitive" } },
              { subsidiaryOf: { contains: q, mode: "insensitive" } },
              { salesforceId: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
      department ? { department: { has: department } } : {},
      marineRole ? { marineRole: marineRole as never } : {},
      emailStatus ? { emailStatus: emailStatus as never } : {},
    ],
  };

  try {
    const [contacts, count, savedFilters] = await Promise.all([
      prisma.contact.findMany({ where, orderBy: { engagementScore: "desc" }, take: 100 }),
      prisma.contact.count({ where }),
      prisma.savedFilter.findMany({
        where: { AND: [scope(workspaceId), { entityType: "CONTACT" }] },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
    return { contacts, count, savedFilters };
  } catch (err) {
    console.error("[contacts] listContacts failed:", err);
    return { contacts: [], count: 0, savedFilters: [] };
  }
}

export async function getContactDetail(id: string) {
  const { workspaceId } = await requireContactWorkspaceId();
  const contact = await prisma.contact.findFirst({ where: { id, ...scope(workspaceId) } });
  if (!contact) {
    notFound();
  }

  const associatedRows = await listAssociatedVesselsForContact(workspaceId, contact.id);
  const vessels = (associatedRows ?? []).map(toAssociatedVesselView);

  return { contact, vessels };
}

export async function listContactLists() {
  const { workspaceId, userId } = await requireContactWorkspaceId();
  try {
    // Include the live vessel count so callers can infer "ETA vs Contact"
    // kind for legacy lists that predate the `filterConfig.kind` marker.
    const rows = await prisma.contactList.findMany({
      where: { AND: [scope(workspaceId), { isArchived: false }, { ownerId: userId }] },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { vessels: true } } },
    });
    return rows.map(({ _count, ...list }) => ({ ...list, vesselCount: _count.vessels }));
  } catch (err) {
    console.error("[contacts] listContactLists failed:", err);
    return [];
  }
}

export async function listSavedContacts(): Promise<ContactModel[]> {
  const { workspaceId, userId } = await requireContactWorkspaceId();
  try {
    const saved = await prisma.savedContact.findMany({
      where: { userId, workspaceId },
      include: { contact: true },
      orderBy: { createdAt: "desc" },
    });
    return saved.map((s) => s.contact);
  } catch (err) {
    console.error("[contacts] listSavedContacts failed:", err);
    return [];
  }
}

export type ListCompanyRow = {
  companyId: string;
  companyKind: CompanyKindString;
  companyName: string;
  country: string | null;
  fleetSize: number;
  website: string | null;
  verified: boolean;
  employeeCount: number;
  /** Vessels at this company across the workspace. */
  vesselCount: number;
  /** Vessels on this list that the company covers in this role. */
  listVessels: Array<{ id: string; vesselName: string; imoNumber: string }>;
  /** True when explicitly added to the list; false when derived from a vessel. */
  addedToList: boolean;
};

export type ListVesselRow = {
  id: string;
  imoNumber: string;
  vesselName: string;
  flag: string | null;
  vesselType: string;
  dwt: number | null;
  capacityDwt: number | null;
  currentPortUnlocode: string | null;
  commercialManagerName: string | null;
  ismManagerName: string | null;
  operatorName: string | null;
  status: string;
  shipOwnerCompany: { id: string; companyName: string } | null;
  ismManagerCompany: { id: string; companyName: string } | null;
  commercialManagerCompany: { id: string; companyName: string } | null;
  addedAt: string | null;
  /** Contacts in this list that match this vessel. Zero = nobody to email. */
  contactCount: number;
};

export type MatchedVesselRow = {
  id: string;
  vesselName: string;
  imoNumber: string;
  nextEta: string | null;
  nextEtaPort: string | null;
};

export type ListContactRow = ContactModel & {
  addedAt: string | null;
  // Vessels in this list that this contact is associated with (email domain /
  // company website / company name), each with its next upcoming ETA — the
  // moment an ETA campaign would fire for this contact via that ship.
  matchedVessels: MatchedVesselRow[];
};

export type ListActivityEntry =
  | { kind: "vessel_added"; label: string; imoNumber: string; at: string }
  | { kind: "contact_added"; label: string; contactId: string; at: string };

export type ContactListDetailResponse = {
  list: ContactListModel;
  companies: ListCompanyRow[];
  contacts: ListContactRow[];
  vessels: ListVesselRow[];
  activity: ListActivityEntry[];
};

export async function getContactListDetail(id: string): Promise<ContactListDetailResponse> {
  const { workspaceId, userId } = await requireContactWorkspaceId();
  const list = await prisma.contactList.findFirst({
    where: { id, ...scope(workspaceId), ownerId: userId },
    include: { companies: true },
  });
  if (!list) {
    notFound();
  }

  const companyLinks = list.companies.map((c) => ({ companyId: c.companyId, companyKind: c.companyKind }));

  const vesselInclude = {
    shipOwnerCompany: { select: { id: true, companyName: true } },
    ismManagerCompany: { select: { id: true, companyName: true } },
    commercialManagerCompany: { select: { id: true, companyName: true } },
  };

  type VesselWithCompanies = Prisma.VesselGetPayload<{ include: typeof vesselInclude }>;

  const vesselOr: Prisma.VesselWhereInput[] = [];
  for (const { companyId, companyKind } of companyLinks) {
    if (companyKind === "SHIP_OWNER") vesselOr.push({ shipOwnerCompanyId: companyId });
    else if (companyKind === "ISM_MANAGER") vesselOr.push({ ismManagerCompanyId: companyId });
    else if (companyKind === "COMMERCIAL_MANAGER") vesselOr.push({ commercialManagerCompanyId: companyId });
  }

  // These four reads are independent of one another (they only depend on the
  // `list` fetched above), so run them in parallel instead of a sequential
  // await chain. Each is capped with `take` so a huge SMART filter or a company
  // with thousands of vessels can't load an unbounded result set into memory.
  const [baseContacts, companyContacts, directVessels, companyVessels] = await Promise.all([
    list.type === "SMART" && list.filterConfig
      ? prisma.contact.findMany({
          where: {
            AND: [
              scope(workspaceId),
              filterConfigToWhereClause(list.filterConfig as unknown as FilterConfig) as Prisma.ContactWhereInput,
            ],
          },
          orderBy: { engagementScore: "desc" },
          take: CONTACT_LIST_MAX,
        })
      : prisma.contact.findMany({
          // No workspace filter on the contact — list ownership is already
          // ownership-scoped above. If the user added a cross-workspace or
          // global contact to their list, they should still see it here.
          where: { listMemberships: { some: { listId: list.id } } },
          orderBy: { engagementScore: "desc" },
          take: CONTACT_LIST_MAX,
        }),
    companyLinks.length > 0
      ? prisma.contact.findMany({
          where: {
            AND: [
              scope(workspaceId),
              { OR: companyLinks.map((c) => ({ companyId: c.companyId, companyKind: c.companyKind })) },
            ],
          },
          orderBy: { engagementScore: "desc" },
          take: CONTACT_LIST_MAX,
        })
      : Promise.resolve([] as ContactModel[]),
    // Vessels the user explicitly added to the list — no workspace filter here.
    // The list itself is already ownership-scoped above, and the ETA global
    // promotion means Port Radar surfaces vessels from any workspace. Adding
    // one via the "Add to list" action creates a ListVessel row that legitimately
    // crosses workspaces; hiding it because vessel.workspaceId != viewer's
    // workspace would silently drop the vessel the user just clicked "Add".
    prisma.vessel.findMany({
      where: { listMemberships: { some: { listId: list.id } } },
      include: vesselInclude,
      orderBy: { vesselName: "asc" },
      take: VESSEL_LIST_MAX,
    }),
    // Vessels expanded from a company that's in the list: keep workspace scope
    // here — this branch is auto-expansion (not a user-driven pick), so limiting
    // it to workspace-owned + global vessels avoids flooding the view with rows
    // the user never explicitly asked for.
    vesselOr.length > 0
      ? prisma.vessel.findMany({
          where: { AND: [scope(workspaceId), { OR: vesselOr }] },
          include: vesselInclude,
          orderBy: { vesselName: "asc" },
          take: VESSEL_LIST_MAX,
        })
      : Promise.resolve([] as VesselWithCompanies[]),
  ]);

  const contactMap = new Map(baseContacts.map((c) => [c.id, c]));
  for (const c of companyContacts) contactMap.set(c.id, c);

  // Backfill website from ApolloRevealCache so the vessel matcher can hit its
  // HIGH-confidence domain path on Apollo rows that were persisted before we
  // started saving website. Rewrites the map in place with the enriched rows.
  const enrichedContacts = await enrichApolloContactsWithCachedWebsite(
    Array.from(contactMap.values()),
  );
  contactMap.clear();
  for (const c of enrichedContacts) contactMap.set(c.id, c);

  const vesselMap = new Map<string, VesselWithCompanies>(directVessels.map((v) => [v.id, v]));
  for (const v of companyVessels) vesselMap.set(v.id, v);

  // Companies come from two places: rows explicitly added to the list, and the
  // owner / ISM / commercial manager of every vessel on it. Without the second
  // source the Companies tab reads "No companies in this list yet" even for a
  // list full of vessels — which is exactly the companies the user wants to
  // reach. Union both, keyed by (companyId, companyKind).
  const vesselCompanyKeys = new Map<string, { companyId: string; companyKind: CompanyKindString }>();
  const vesselsByCompanyKey = new Map<string, Array<{ id: string; vesselName: string; imoNumber: string }>>();
  for (const vessel of vesselMap.values()) {
    const pairs: Array<[CompanyKindString, { id: string } | null]> = [
      ["SHIP_OWNER", vessel.shipOwnerCompany],
      ["ISM_MANAGER", vessel.ismManagerCompany],
      ["COMMERCIAL_MANAGER", vessel.commercialManagerCompany],
    ];
    for (const [companyKind, company] of pairs) {
      if (!company) continue;
      const key = `${companyKind}:${company.id}`;
      vesselCompanyKeys.set(key, { companyId: company.id, companyKind });
      const bucket = vesselsByCompanyKey.get(key) ?? [];
      bucket.push({ id: vessel.id, vesselName: vessel.vesselName, imoNumber: vessel.imoNumber });
      vesselsByCompanyKey.set(key, bucket);
    }
  }

  const idsForKind = (kind: CompanyKindString) =>
    Array.from(
      new Set([
        ...companyLinks.filter((l) => l.companyKind === kind).map((l) => l.companyId),
        ...Array.from(vesselCompanyKeys.values())
          .filter((entry) => entry.companyKind === kind)
          .map((entry) => entry.companyId),
      ]),
    );
  const shipOwnerIds = idsForKind("SHIP_OWNER");
  const ismManagerIds = idsForKind("ISM_MANAGER");
  const commercialManagerIds = idsForKind("COMMERCIAL_MANAGER");

  // Explicit links first so a hand-added company keeps its position; the Map
  // key dedupes a company that is both linked and derived from a vessel.
  const allCompanyKeysMap = new Map<string, { companyId: string; companyKind: CompanyKindString }>();
  for (const link of companyLinks) {
    allCompanyKeysMap.set(`${link.companyKind}:${link.companyId}`, {
      companyId: link.companyId,
      companyKind: link.companyKind,
    });
  }
  for (const [key, entry] of vesselCompanyKeys) allCompanyKeysMap.set(key, entry);
  const allCompanyKeys = Array.from(allCompanyKeysMap.values());

  const [shipOwnerRows, ismManagerRows, commercialManagerRows, employeeGroups, shipOwnerVesselGroups, ismVesselGroups, cmVesselGroups] = await Promise.all([
    shipOwnerIds.length > 0
      ? prisma.shipOwnerCompany.findMany({ where: { id: { in: shipOwnerIds }, ...scope(workspaceId) } })
      : Promise.resolve([]),
    ismManagerIds.length > 0
      ? prisma.iSMManagerCompany.findMany({ where: { id: { in: ismManagerIds }, ...scope(workspaceId) } })
      : Promise.resolve([]),
    commercialManagerIds.length > 0
      ? prisma.commercialManagerCompany.findMany({ where: { id: { in: commercialManagerIds }, ...scope(workspaceId) } })
      : Promise.resolve([]),
    allCompanyKeys.length > 0
      ? prisma.contact.groupBy({
          by: ["companyId", "companyKind"],
          where: {
            AND: [
              scope(workspaceId),
              { OR: allCompanyKeys.map((c) => ({ companyId: c.companyId, companyKind: c.companyKind })) },
            ],
          },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ companyId: string | null; companyKind: string; _count: { _all: number } }>),
    shipOwnerIds.length > 0
      ? prisma.vessel.groupBy({
          by: ["shipOwnerCompanyId"],
          where: { AND: [scope(workspaceId), { shipOwnerCompanyId: { in: shipOwnerIds } }] },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ shipOwnerCompanyId: string | null; _count: { _all: number } }>),
    ismManagerIds.length > 0
      ? prisma.vessel.groupBy({
          by: ["ismManagerCompanyId"],
          where: { AND: [scope(workspaceId), { ismManagerCompanyId: { in: ismManagerIds } }] },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ ismManagerCompanyId: string | null; _count: { _all: number } }>),
    commercialManagerIds.length > 0
      ? prisma.vessel.groupBy({
          by: ["commercialManagerCompanyId"],
          where: { AND: [scope(workspaceId), { commercialManagerCompanyId: { in: commercialManagerIds } }] },
          _count: { _all: true },
        })
      : Promise.resolve([] as Array<{ commercialManagerCompanyId: string | null; _count: { _all: number } }>),
  ]);

  const shipOwnerMap = new Map(shipOwnerRows.map((c) => [c.id, c]));
  const ismManagerMap = new Map(ismManagerRows.map((c) => [c.id, c]));
  const commercialManagerMap = new Map(commercialManagerRows.map((c) => [c.id, c]));
  const employeeCountMap = new Map(employeeGroups.map((g) => [`${g.companyKind}:${g.companyId ?? ""}`, g._count._all]));
  const vesselCountMap = new Map<string, number>();
  for (const g of shipOwnerVesselGroups) if (g.shipOwnerCompanyId) vesselCountMap.set(`SHIP_OWNER:${g.shipOwnerCompanyId}`, g._count._all);
  for (const g of ismVesselGroups) if (g.ismManagerCompanyId) vesselCountMap.set(`ISM_MANAGER:${g.ismManagerCompanyId}`, g._count._all);
  for (const g of cmVesselGroups) if (g.commercialManagerCompanyId) vesselCountMap.set(`COMMERCIAL_MANAGER:${g.commercialManagerCompanyId}`, g._count._all);

  const explicitKeys = new Set(companyLinks.map((l) => `${l.companyKind}:${l.companyId}`));

  const companies: ListCompanyRow[] = allCompanyKeys
    .map(({ companyId, companyKind }) => {
      const company =
        companyKind === "SHIP_OWNER"
          ? shipOwnerMap.get(companyId)
          : companyKind === "ISM_MANAGER"
            ? ismManagerMap.get(companyId)
            : companyKind === "COMMERCIAL_MANAGER"
              ? commercialManagerMap.get(companyId)
              : null;
      const key = `${companyKind}:${companyId}`;
      return {
        companyId,
        companyKind,
        companyName: company?.companyName ?? "(unknown)",
        country: company?.country ?? null,
        fleetSize: company?.fleetSize ?? 0,
        website: company?.website ?? null,
        verified: company?.verified ?? false,
        employeeCount: employeeCountMap.get(key) ?? 0,
        vesselCount: vesselCountMap.get(key) ?? 0,
        // Vessels on THIS list that the company covers in this role — the
        // workspace-wide vesselCount above can be much larger.
        listVessels: vesselsByCompanyKey.get(key) ?? [],
        // Derived rows have no ListCompany row, so they can't be un-linked.
        addedToList: explicitKeys.has(key),
      };
    })
    .sort((a, b) => a.companyName.localeCompare(b.companyName));

  const [listVesselMemberships, listContactMemberships] = await Promise.all([
    prisma.listVessel.findMany({
      where: { listId: list.id },
      select: { vesselId: true, createdAt: true },
    }),
    prisma.listContact.findMany({
      where: { listId: list.id },
      select: { contactId: true, createdAt: true },
    }),
  ]);
  const vesselAddedMap = new Map(listVesselMemberships.map((row) => [row.vesselId, row.createdAt.toISOString()]));
  const contactAddedMap = new Map(listContactMemberships.map((row) => [row.contactId, row.createdAt.toISOString()]));

  const vessels: ListVesselRow[] = Array.from(vesselMap.values()).map((v) => ({
    id: v.id,
    imoNumber: v.imoNumber,
    vesselName: v.vesselName,
    flag: v.flag,
    vesselType: v.vesselType,
    dwt: v.dwt,
    capacityDwt: v.capacityDwt,
    currentPortUnlocode: v.currentPortUnlocode,
    commercialManagerName: v.commercialManagerName,
    ismManagerName: v.ismManagerName,
    operatorName: v.operatorName,
    status: v.status,
    shipOwnerCompany: v.shipOwnerCompany,
    ismManagerCompany: v.ismManagerCompany,
    commercialManagerCompany: v.commercialManagerCompany,
    addedAt: vesselAddedMap.get(v.id) ?? null,
    // Filled in below, once contact↔vessel matches are known.
    contactCount: 0,
  }));

  // Contact ↔ vessel association for the list. Pull the full match-signal
  // fields (vessel synthetic emails + owner/manager company email/website) and
  // the next upcoming ETA for every vessel in this list, then run the same
  // matcher the ETA scheduler uses at fire time. One contact can match several
  // vessels; each carries its own next ETA.
  const listVesselIds = Array.from(vesselMap.keys());
  const matchVessels =
    listVesselIds.length > 0
      ? await prisma.vessel.findMany({
          where: { id: { in: listVesselIds } },
          include: {
            shipOwnerCompany: true,
            ismManagerCompany: true,
            commercialManagerCompany: true,
            etas: {
              where: { eta: { gt: new Date() } },
              orderBy: { eta: "asc" },
              take: 1,
              select: { eta: true, destinationPortName: true, destinationPort: true },
            },
          },
        })
      : [];

  // Explicit vessel ids pinned onto Apollo contacts at add time — unioned
  // with the live matcher so associations survive domains the matcher can't
  // reconnect (Apollo bridges e.g. citi.com ↔ citibank.com in its org graph).
  const explicitVesselIds = (contact: { customFields?: unknown }): string[] => {
    const fields = contact.customFields;
    if (!fields || typeof fields !== "object") return [];
    const ids = (fields as Record<string, unknown>).matchedVesselIds;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  };

  const contactRows: ListContactRow[] = Array.from(contactMap.values()).map((c) => {
    const pinned = explicitVesselIds(c);
    const matchedVessels: MatchedVesselRow[] = matchVessels
      .filter((v) => matchContactToVessel(c, v) !== null || pinned.includes(v.id))
      .map((v) => {
        const nextEta = v.etas[0] ?? null;
        return {
          id: v.id,
          vesselName: v.vesselName,
          imoNumber: v.imoNumber,
          nextEta: nextEta ? nextEta.eta.toISOString() : null,
          nextEtaPort: nextEta ? nextEta.destinationPortName || nextEta.destinationPort : null,
        };
      });
    return {
      ...c,
      addedAt: contactAddedMap.get(c.id) ?? null,
      matchedVessels,
    };
  });

  // Invert contact→vessel matches into a per-vessel tally. Free: it reuses the
  // matches just computed above rather than re-running the matcher. A vessel at
  // zero is one whose owner/manager companies have nobody to email yet — the
  // Vessels tab flags those so they can be filled from the role search.
  const vesselContactCounts = new Map<string, number>();
  for (const row of contactRows) {
    for (const vessel of row.matchedVessels) {
      vesselContactCounts.set(vessel.id, (vesselContactCounts.get(vessel.id) ?? 0) + 1);
    }
  }
  for (const vessel of vessels) {
    vessel.contactCount = vesselContactCounts.get(vessel.id) ?? 0;
  }

  const activity: ListActivityEntry[] = [
    ...vessels
      .filter((v) => v.addedAt)
      .map((v): ListActivityEntry => ({
        kind: "vessel_added",
        label: v.vesselName,
        imoNumber: v.imoNumber,
        at: v.addedAt!,
      })),
    ...contactRows
      .filter((c) => c.addedAt)
      .map((c): ListActivityEntry => ({
        kind: "contact_added",
        label: `${c.firstName} ${c.lastName}`.trim() || c.email,
        contactId: c.id,
        at: c.addedAt!,
      })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  return { list, companies, contacts: contactRows, vessels, activity };
}


export function formatEnum(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

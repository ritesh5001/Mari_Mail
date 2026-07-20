import { Prisma, prisma, type CompanyKind } from "@marimail/db";
import { filterConfigToWhereClause } from "@marimail/utils";
import { workspaceScope } from "./workspace-scope.js";
import { serializeContact, serializeVessel, vesselInclude } from "./serializers.js";

type ListMembership = {
  listCompanies: { companyId: string; companyKind: CompanyKind }[];
};

type CompanyRow = {
  companyId: string;
  companyKind: CompanyKind;
  companyName: string;
  country: string | null;
  fleetSize: number;
  website: string | null;
  verified: boolean;
  employeeCount: number;
  vesselCount: number;
};

function vesselFkFor(kind: CompanyKind): keyof Prisma.VesselWhereInput | null {
  if (kind === "SHIP_OWNER") return "shipOwnerCompanyId";
  if (kind === "ISM_MANAGER") return "ismManagerCompanyId";
  if (kind === "COMMERCIAL_MANAGER") return "commercialManagerCompanyId";
  return null;
}

async function loadCompanyById(workspaceId: string, kind: CompanyKind, id: string) {
  const where = { id, ...workspaceScope(workspaceId) };
  if (kind === "SHIP_OWNER") return prisma.shipOwnerCompany.findFirst({ where });
  if (kind === "ISM_MANAGER") return prisma.iSMManagerCompany.findFirst({ where });
  if (kind === "COMMERCIAL_MANAGER") return prisma.commercialManagerCompany.findFirst({ where });
  return null;
}

export async function companyExists(workspaceId: string, kind: CompanyKind, id: string) {
  const company = await loadCompanyById(workspaceId, kind, id);
  return Boolean(company);
}

async function buildCompanyRows(
  workspaceId: string,
  links: ListMembership["listCompanies"],
): Promise<CompanyRow[]> {
  if (links.length === 0) return [];

  const rows = await Promise.all(
    links.map(async ({ companyId, companyKind }) => {
      const company = await loadCompanyById(workspaceId, companyKind, companyId);
      if (!company) return null;

      const fk = vesselFkFor(companyKind);
      const [employeeCount, vesselCount] = await Promise.all([
        prisma.contact.count({
          where: { AND: [workspaceScope(workspaceId), { companyId, companyKind }] },
        }),
        fk
          ? prisma.vessel.count({
              where: { AND: [workspaceScope(workspaceId), { [fk]: companyId }] },
            })
          : Promise.resolve(0),
      ]);

      return {
        companyId,
        companyKind,
        companyName: company.companyName,
        country: company.country,
        fleetSize: company.fleetSize,
        website: company.website,
        verified: company.verified,
        employeeCount,
        vesselCount,
      };
    }),
  );

  return rows.filter((row): row is CompanyRow => row !== null);
}

export async function resolveListMembers(workspaceId: string, userId: string, listId: string) {
  const list = await prisma.contactList.findFirst({
    where: { id: listId, ...workspaceScope(workspaceId), ownerId: userId },
    include: { companies: true },
  });
  if (!list) return null;

  const companyLinks = list.companies.map((c) => ({ companyId: c.companyId, companyKind: c.companyKind }));

  // SMART lists resolve contacts via the saved filter; STATIC lists via the join table.
  // Explicit ListCompany memberships always add their employees on top, regardless of list type.
  const baseContacts =
    list.type === "SMART" && list.filterConfig
      ? await prisma.contact.findMany({
          where: {
            AND: [
              workspaceScope(workspaceId),
              filterConfigToWhereClause(list.filterConfig as never) as Prisma.ContactWhereInput,
            ],
          },
          orderBy: { engagementScore: "desc" },
        })
      : await prisma.contact.findMany({
          // Directly-added list members: no workspace filter on the contact.
          // The list itself is already ownership-scoped, so if the user added
          // a cross-workspace contact via "Add to list", they should still
          // see it here.
          where: { listMemberships: { some: { listId: list.id } } },
          orderBy: { engagementScore: "desc" },
        });

  const companyContacts =
    companyLinks.length > 0
      ? await prisma.contact.findMany({
          where: {
            AND: [
              workspaceScope(workspaceId),
              { OR: companyLinks.map((c) => ({ companyId: c.companyId, companyKind: c.companyKind })) },
            ],
          },
          orderBy: { engagementScore: "desc" },
        })
      : [];

  const contactMap = new Map(baseContacts.map((c) => [c.id, c]));
  for (const c of companyContacts) contactMap.set(c.id, c);

  const directVessels = await prisma.vessel.findMany({
    // Same reasoning as contacts above — directly-added vessels are always
    // visible in the list they were added to. This fixes "I added 3 vessels
    // from Port Radar but the list still says 0 vessels" for cross-workspace
    // vessels (which is now common since ETAs are globally visible).
    where: { listMemberships: { some: { listId: list.id } } },
    include: vesselInclude,
    orderBy: { vesselName: "asc" },
  });

  const companyVessels =
    companyLinks.length > 0
      ? await prisma.vessel.findMany({
          where: {
            AND: [
              workspaceScope(workspaceId),
              {
                OR: companyLinks
                  .map(({ companyId, companyKind }) => {
                    const fk = vesselFkFor(companyKind);
                    if (!fk) return null;
                    return { [fk]: companyId } as Prisma.VesselWhereInput;
                  })
                  .filter((w): w is Prisma.VesselWhereInput => w !== null),
              },
            ],
          },
          include: vesselInclude,
          orderBy: { vesselName: "asc" },
        })
      : [];

  const vesselMap = new Map(directVessels.map((v) => [v.id, v]));
  for (const v of companyVessels) vesselMap.set(v.id, v);

  const companies = await buildCompanyRows(workspaceId, companyLinks);

  return {
    list,
    companies,
    contacts: Array.from(contactMap.values()).map(serializeContact),
    vessels: Array.from(vesselMap.values()).map(serializeVessel),
  };
}

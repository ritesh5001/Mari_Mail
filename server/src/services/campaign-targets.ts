import { Prisma, prisma, type Contact, type VesselETA } from "@marimail/db";

export type TargetRole = "SHIP_OWNER" | "ISM_MANAGER" | "COMMERCIAL_MANAGER";
const targetRoles: TargetRole[] = ["SHIP_OWNER", "ISM_MANAGER", "COMMERCIAL_MANAGER"];

export type MarineRole =
  | "FLEET_MANAGER"
  | "SHIP_SUPERINTENDENT"
  | "TECHNICAL_MANAGER"
  | "CREWING_MANAGER"
  | "CHARTERING_MANAGER"
  | "PORT_CAPTAIN"
  | "MARINE_SURVEYOR"
  | "CLASS_SURVEYOR"
  | "UNDERWRITER"
  | "BROKER"
  | "PORT_AGENT"
  | "CHANDLER"
  | "BUNKER_TRADER"
  | "OPA_PROVIDER"
  | "OTHER";
const marineRoleValues: MarineRole[] = [
  "FLEET_MANAGER",
  "SHIP_SUPERINTENDENT",
  "TECHNICAL_MANAGER",
  "CREWING_MANAGER",
  "CHARTERING_MANAGER",
  "PORT_CAPTAIN",
  "MARINE_SURVEYOR",
  "CLASS_SURVEYOR",
  "UNDERWRITER",
  "BROKER",
  "PORT_AGENT",
  "CHANDLER",
  "BUNKER_TRADER",
  "OPA_PROVIDER",
  "OTHER",
];

export type CampaignTargetConfig = {
  roles?: TargetRole[];
  marineRoles?: MarineRole[];
  contactListIds?: string[];
  contactIds?: string[];
};

function isTargetConfig(value: unknown): value is CampaignTargetConfig {
  return Boolean(value && typeof value === "object");
}

export function parseTargetConfig(value: Prisma.JsonValue): CampaignTargetConfig {
  if (!isTargetConfig(value)) {
    return { roles: ["SHIP_OWNER", "ISM_MANAGER", "COMMERCIAL_MANAGER"] };
  }
  const config = value as Record<string, unknown>;
  return {
    roles: Array.isArray(config.roles) ? config.roles.filter((item): item is TargetRole => targetRoles.includes(item as TargetRole)) : [],
    marineRoles: Array.isArray(config.marineRoles) ? config.marineRoles.filter((item): item is MarineRole => marineRoleValues.includes(item as MarineRole)) : [],
    contactListIds: Array.isArray(config.contactListIds) ? config.contactListIds.filter((item): item is string => typeof item === "string") : [],
    contactIds: Array.isArray(config.contactIds) ? config.contactIds.filter((item): item is string => typeof item === "string") : [],
  };
}

async function collectListVesselCompanyNames(
  contactListIds: string[],
  companyRoles: TargetRole[] | undefined,
): Promise<string[]> {
  if (!contactListIds.length) return [];
  const listVessels = await prisma.listVessel.findMany({
    where: { listId: { in: contactListIds } },
    select: {
      vessel: {
        select: {
          shipOwnerCompany: { select: { companyName: true } },
          ismManagerCompany: { select: { companyName: true } },
          commercialManagerCompany: { select: { companyName: true } },
        },
      },
    },
  });
  const wantOwner = !companyRoles?.length || companyRoles.includes("SHIP_OWNER");
  const wantIsm = !companyRoles?.length || companyRoles.includes("ISM_MANAGER");
  const wantComm = !companyRoles?.length || companyRoles.includes("COMMERCIAL_MANAGER");
  const names = new Set<string>();
  for (const lv of listVessels) {
    if (wantOwner && lv.vessel.shipOwnerCompany?.companyName) names.add(lv.vessel.shipOwnerCompany.companyName);
    if (wantIsm && lv.vessel.ismManagerCompany?.companyName) names.add(lv.vessel.ismManagerCompany.companyName);
    if (wantComm && lv.vessel.commercialManagerCompany?.companyName) names.add(lv.vessel.commercialManagerCompany.companyName);
  }
  return Array.from(names);
}

export async function resolveCampaignContacts(input: {
  workspaceId: string;
  targetConfig: Prisma.JsonValue;
  eta?: (VesselETA & {
    vessel: {
      shipOwnerCompany?: { companyName: string } | null;
      ismManagerCompany?: { companyName: string } | null;
      commercialManagerCompany?: { companyName: string } | null;
    };
  }) | null;
}) {
  const target = parseTargetConfig(input.targetConfig);
  const or: Prisma.ContactWhereInput[] = [];

  if (target.contactIds?.length) {
    or.push({ id: { in: target.contactIds } });
  }

  if (target.contactListIds?.length) {
    or.push({ listMemberships: { some: { listId: { in: target.contactListIds } } } });

    // Contacts that aren't directly in the list but match a vessel-linked company
    // in the list. This is what makes "list of vessels + marine role" resolve to
    // the right people — the reason auto-enrol works when the user adds a new
    // vessel to the list later.
    const companyNames = await collectListVesselCompanyNames(target.contactListIds, target.roles);
    if (companyNames.length) {
      or.push({ companyName: { in: companyNames, mode: "insensitive" } });
    }
  }

  if (input.eta) {
    const roleCompanyNames: string[] = [];
    if (target.roles?.includes("SHIP_OWNER") && input.eta.vessel.shipOwnerCompany?.companyName) {
      roleCompanyNames.push(input.eta.vessel.shipOwnerCompany.companyName);
    }
    if (target.roles?.includes("ISM_MANAGER") && input.eta.vessel.ismManagerCompany?.companyName) {
      roleCompanyNames.push(input.eta.vessel.ismManagerCompany.companyName);
    }
    if (target.roles?.includes("COMMERCIAL_MANAGER") && input.eta.vessel.commercialManagerCompany?.companyName) {
      roleCompanyNames.push(input.eta.vessel.commercialManagerCompany.companyName);
    }
    if (roleCompanyNames.length) {
      or.push({ companyName: { in: roleCompanyNames, mode: "insensitive" } });
    }
  }

  // Workspace scope: usually contacts belong to the campaign's workspace, but
  // CSV-imported global contacts (workspaceId=null) become legitimate targets
  // when they're members of one of the campaign's workspace-scoped target
  // lists. Without this branch every campaign backed by a CSV-imported list
  // resolves to zero recipients — the exact bug that made "0 sent of 0"
  // happen for the "new test campaign" against the "2 July" list.
  const workspaceScope: Prisma.ContactWhereInput = target.contactListIds?.length
    ? {
        OR: [
          { workspaceId: input.workspaceId },
          {
            workspaceId: null,
            listMemberships: { some: { listId: { in: target.contactListIds } } },
          },
        ],
      }
    : { workspaceId: input.workspaceId };

  const where: Prisma.ContactWhereInput = {
    AND: [
      workspaceScope,
      { emailStatus: { not: "INVALID" } },
      // Locked Apollo previews are stubs with @unknown.local placeholder
      // emails and haven't been revealed yet — skipping them here means we
      // never queue a send that would bounce, and adding them to a list or
      // campaign never silently deducts credits. The user reveals them
      // explicitly from People Finder (1 credit per email) to make them
      // eligible.
      { NOT: { email: { endsWith: "@unknown.local" } } },
      ...(target.marineRoles?.length
        ? [{ marineRole: { in: target.marineRoles } as Prisma.ContactWhereInput["marineRole"] }]
        : []),
      ...(or.length ? [{ OR: or }] : []),
    ],
  };

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: [{ engagementScore: "desc" }, { createdAt: "desc" }],
    take: 500,
  });

  return removeSuppressed(input.workspaceId, contacts);
}

export async function removeSuppressed(workspaceId: string, contacts: Contact[]) {
  if (!contacts.length) return [];
  const emails = contacts.map((contact) => contact.email.toLowerCase());
  const suppressions = await prisma.globalSuppression.findMany({
    where: {
      email: { in: emails },
      OR: [{ workspaceId }, { workspaceId: null }],
    },
    select: { email: true },
  });
  const suppressed = new Set(suppressions.map((item) => item.email.toLowerCase()));
  return contacts.filter((contact) => !suppressed.has(contact.email.toLowerCase()));
}

/**
 * Contacts staged for review are candidates, not campaign members — they were
 * pulled in by a list change on a live campaign and nobody has confirmed them
 * yet. Every send path must subtract these before scheduling or sending.
 *
 * Deliberately not folded into resolveCampaignContacts: that resolves the
 * *candidate* set, which is exactly what the review UI and the confirm
 * endpoint need to enumerate.
 */
export async function stagedContactIds(campaignId: string, candidateIds: string[]) {
  if (!candidateIds.length) return new Set<string>();
  const rows = await prisma.campaignContact.findMany({
    where: { campaignId, contactId: { in: candidateIds }, status: "STAGED" },
    select: { contactId: true },
  });
  return new Set(rows.map((row) => row.contactId));
}

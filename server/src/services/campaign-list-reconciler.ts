import { prisma, type Contact, type Prisma } from "@marimail/db";
import { matchContactToVessel } from "@marimail/utils";
import { resolveCampaignContacts } from "./campaign-targets.js";

const listVesselInclude = {
  shipOwnerCompany: true,
  ismManagerCompany: true,
  commercialManagerCompany: true,
} satisfies Prisma.VesselInclude;

type ListVesselWithCompanies = Prisma.VesselGetPayload<{ include: typeof listVesselInclude }>;

/**
 * Stage campaign candidates after a list's membership changed (a vessel or
 * contact was added). For every ACTIVE campaign whose `targetConfig` targets
 * this list, resolve the campaign's target-contact set as if launching now and
 * record anyone not already enrolled as a STAGED CampaignContact.
 *
 * Staged rows are candidates, not members: no send path acts on them until the
 * user confirms from the campaign's Leads tab. This is deliberate — adding a
 * vessel to a live campaign's list used to enrol and email every newly-matched
 * person instantly, with no chance to review who was about to be contacted.
 *
 * Only ACTIVE campaigns are staged. A DRAFT campaign has never launched, so
 * additions are just the user building the list — those enrol normally at
 * launch, which is also why launch never has staged rows to trip over.
 *
 * Fire-and-forget: designed to be `void`-called from the list endpoints. Any
 * error is logged, not re-thrown.
 */
export async function reconcileCampaignsForList(listId: string): Promise<void> {
  try {
    // Prisma can't index into JSON with a `some/in` filter directly, so we do
    // a coarse pull of all ACTIVE campaigns and filter in memory. The counts
    // are tiny compared to CampaignContact / Contact so this is fine.
    const campaigns = await prisma.campaign.findMany({ where: { status: "ACTIVE" } });

    const relevant = campaigns.filter((campaign) => targetsList(campaign.targetConfig, listId));
    if (!relevant.length) return;

    // Full company rows (not just names): mapNewcomersToVessels matches on
    // email domain and company website, so it needs the complete signal set.
    const listVessels = await prisma.vessel.findMany({
      where: { listMemberships: { some: { listId } } },
      include: listVesselInclude,
    });

    for (const campaign of relevant) {
      const contacts = await resolveCampaignContacts({
        workspaceId: campaign.workspaceId,
        targetConfig: campaign.targetConfig,
      });
      if (!contacts.length) continue;

      const existing = await prisma.campaignContact.findMany({
        where: { campaignId: campaign.id, contactId: { in: contacts.map((c) => c.id) } },
        select: { contactId: true },
      });
      const known = new Set(existing.map((row) => row.contactId));
      const newcomers = contacts.filter((contact) => !known.has(contact.id));
      if (!newcomers.length) continue;

      const vesselByContact = mapNewcomersToVessels(newcomers, listVessels);

      // skipDuplicates + @@unique([campaignId, contactId]) means an already
      // enrolled contact is never demoted to STAGED — that's the whole
      // back-compat story for campaigns already sending.
      const staged = await prisma.campaignContact.createMany({
        data: newcomers.map((contact) => ({
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          contactId: contact.id,
          vesselId: vesselByContact.get(contact.id) ?? null,
          status: "STAGED" as const,
          stagedAt: new Date(),
          stagedReason: "list-membership-changed",
        })),
        skipDuplicates: true,
      });

      if (staged.count > 0) {
        console.log(
          `[list-reconciler] staged ${staged.count} contact(s) for campaign=${campaign.id} from list=${listId} — awaiting review.`,
        );
      }
    }
  } catch (err) {
    console.warn(`[list-reconciler] failed for list=${listId}: ${(err as Error).message}`);
  }
}

/**
 * Which newly-added vessel surfaced each candidate — the grouping key for the
 * review UI. Same union rule the ETA scheduler uses: live matcher OR the
 * explicit matchedVesselIds pinned onto Apollo contacts when they were added
 * from the list's vessel-domain search (Apollo bridges related domains —
 * citi.com ↔ citibank.com — that the matcher can't reconnect from the
 * persisted contact alone).
 *
 * CampaignContact.vesselId is a single FK, so a contact matching two vessels
 * gets grouped under the first. Contacts with no vessel signal map to null and
 * land in the UI's "Other new contacts" bucket.
 */
function mapNewcomersToVessels(
  newcomers: Contact[],
  vessels: ListVesselWithCompanies[],
): Map<string, string> {
  const byContact = new Map<string, string>();
  for (const contact of newcomers) {
    const pinned = pinnedVesselIds(contact);
    const hit = vessels.find(
      (vessel) => matchContactToVessel(contact, vessel) !== null || pinned.includes(vessel.id),
    );
    if (hit) byContact.set(contact.id, hit.id);
  }
  return byContact;
}

function pinnedVesselIds(contact: { customFields?: unknown }): string[] {
  const fields = contact.customFields;
  if (!fields || typeof fields !== "object") return [];
  const ids = (fields as Record<string, unknown>).matchedVesselIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

function targetsList(targetConfig: Prisma.JsonValue, listId: string): boolean {
  if (!targetConfig || typeof targetConfig !== "object" || Array.isArray(targetConfig)) return false;
  const raw = (targetConfig as Record<string, unknown>).contactListIds;
  if (!Array.isArray(raw)) return false;
  return raw.some((id) => id === listId);
}

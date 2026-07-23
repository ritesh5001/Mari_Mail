import { prisma, type Contact, type Prisma } from "@marimail/db";
import { matchContactToVessel } from "@marimail/utils";
import { resolveCampaignContacts } from "./campaign-targets.js";
import { enrolAndScheduleManualContact } from "./campaign-manual-scheduler.js";

const listVesselInclude = {
  shipOwnerCompany: true,
  ismManagerCompany: true,
  commercialManagerCompany: true,
} satisfies Prisma.VesselInclude;

type ListVesselWithCompanies = Prisma.VesselGetPayload<{ include: typeof listVesselInclude }>;

/**
 * React to a list-membership change (a vessel or contact was added) on every
 * ACTIVE campaign that targets the list. Two paths, chosen by triggerType:
 *
 *   MANUAL campaigns: enrol every newcomer immediately by calling
 *   `enrolAndScheduleManualContact` — the exact same helper the campaign's
 *   own launch uses. That means the new contact inherits the campaign's
 *   send window, per-campaign send gap, sequence delays, and per-inbox gap,
 *   and starts sending as soon as the pacing allows. This is what a user
 *   who adds a contact to a live MANUAL campaign's list is asking for.
 *
 *   ETA campaigns: still stage as STAGED for user review. ETA campaigns
 *   involve vessel matching + cross-workspace contact data where the "did
 *   you really mean to email these people" gate matters more, and their
 *   send path is trigger-driven (needs an ETA event to fire), not just a
 *   list-driven schedule. The Leads tab still exposes /staged/confirm for
 *   this path.
 *
 * Only ACTIVE campaigns are touched. DRAFT campaigns are still list-building
 * — those enrol normally at launch, which is why launch never has staged
 * rows to trip over.
 *
 * Fire-and-forget: designed to be `void`-called from the list endpoints. Any
 * error is logged, not re-thrown, so a slow reconciler can't stall the HTTP
 * response the user is waiting on.
 */
export async function reconcileCampaignsForList(listId: string): Promise<void> {
  try {
    // Prisma can't index into JSON with a `some/in` filter directly, so we do
    // a coarse pull of all ACTIVE campaigns and filter in memory. The counts
    // are tiny compared to CampaignContact / Contact so this is fine.
    // Pull sequences too — the MANUAL branch calls
    // enrolAndScheduleManualContact which needs them, and a separate query
    // per relevant campaign is wasteful.
    const campaigns = await prisma.campaign.findMany({
      where: { status: "ACTIVE" },
      include: { sequences: { orderBy: { stepOrder: "asc" } } },
    });

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

      if (campaign.triggerType === "MANUAL") {
        // Live auto-enrol: same call the initial launch loop makes, once per
        // new contact. This creates the CampaignContact row (SCHEDULED) and
        // queues its sequence steps on the campaign's window, per-campaign
        // send gap included. Failures are per-contact-tolerant so a single
        // scheduler blip doesn't skip the rest of the batch.
        let scheduled = 0;
        for (const contact of newcomers) {
          try {
            scheduled += await enrolAndScheduleManualContact(campaign, contact.id);
          } catch (err) {
            console.warn(
              `[list-reconciler] auto-enrol failed campaign=${campaign.id} contact=${contact.id}: ${(err as Error).message}`,
            );
          }
        }
        if (scheduled > 0) {
          console.log(
            `[list-reconciler] auto-enrolled ${newcomers.length} new contact(s) into MANUAL campaign=${campaign.id} from list=${listId} · scheduled ${scheduled} step(s).`,
          );
        }
        continue;
      }

      // ETA path — unchanged. Stage for review; the campaign's Leads tab
      // promotes STAGED → PENDING via /staged/confirm, which then backscans
      // pending ETAs to create triggers.
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
          `[list-reconciler] staged ${staged.count} contact(s) for ETA campaign=${campaign.id} from list=${listId} — awaiting review.`,
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

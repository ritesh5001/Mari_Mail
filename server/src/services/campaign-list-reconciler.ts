import { prisma, type Contact, type Prisma } from "@marimail/db";
import { matchContactToVessel } from "@marimail/utils";
import { resolveCampaignContacts } from "./campaign-targets.js";
import { enrolAndScheduleManualContact } from "./campaign-manual-scheduler.js";
import { scheduleUpcomingEtasForCampaignVessels } from "./campaign-scheduler.js";

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
 *   ETA campaigns: automatically enrol every usable newcomer that can be
 *   attributed to one of the list's vessels, then backscan that vessel's
 *   upcoming ETAs. The contact inherits the campaign's existing sequence,
 *   inbox rotation, schedule, and options. Locked, invalid, suppressed, and
 *   blocked contacts never reach `resolveCampaignContacts`; contacts without
 *   a vessel match remain unenrolled because no ETA can safely fire for them.
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

    // Full company rows (not just names): mapContactsToVessels matches on
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
        select: { contactId: true, status: true },
      });
      const existingByContact = new Map(existing.map((row) => [row.contactId, row.status]));
      const known = new Set(existingByContact.keys());
      const newcomers = contacts.filter((contact) => !known.has(contact.id));

      // Self-heal, ETA campaigns only: a contact already enrolled but with no
      // vessel attribution (vesselId = null) never gets scheduled — an ETA
      // fires against ONE vessel and the scheduler skips contacts it can't
      // tie to that vessel, so they sit at PENDING forever. This was the
      // "Apollo contact added, then stuck, never scheduled" bug. Now, on
      // every list change, we re-check those stranded rows: if the contact
      // has since gained a vessel link (its customFields.matchedVesselIds
      // healed on re-add, or the domain matcher now hits), attribute it and
      // schedule its vessel's upcoming ETAs. Runs BEFORE the newcomer
      // early-return below, because a stranded contact is never a newcomer.
      if (campaign.triggerType !== "MANUAL") {
        await healStrandedEtaContacts(campaign.id, contacts, listVessels);
      }

      if (campaign.triggerType === "MANUAL") {
        if (!newcomers.length) continue;
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

      // A list addition is explicit opt-in to this already-running campaign.
      // Include old STAGED rows too so workspaces created before automatic
      // enrolment self-heal on their next list change.
      const legacyStaged = contacts.filter(
        (contact) => existingByContact.get(contact.id) === "STAGED",
      );
      const candidates = [...newcomers, ...legacyStaged];
      if (!candidates.length) continue;

      const vesselByContact = mapContactsToVessels(candidates, listVessels);
      const attributable = candidates.filter((contact) => vesselByContact.has(contact.id));
      const deferred = candidates.length - attributable.length;
      if (!attributable.length) {
        console.log(
          `[list-reconciler] deferred ${deferred} ETA contact(s) with no vessel attribution campaign=${campaign.id} list=${listId}.`,
        );
        continue;
      }

      const fresh = attributable.filter((contact) => !known.has(contact.id));
      if (fresh.length) {
        await prisma.campaignContact.createMany({
          data: fresh.map((contact) => ({
            workspaceId: campaign.workspaceId,
            campaignId: campaign.id,
            contactId: contact.id,
            vesselId: vesselByContact.get(contact.id)!,
            status: "PENDING" as const,
          })),
          skipDuplicates: true,
        });
      }

      // Different contacts can belong to different vessels, so legacy staged
      // rows are promoted individually to preserve their attribution.
      for (const contact of attributable.filter(
        (item) => existingByContact.get(item.id) === "STAGED",
      )) {
        await prisma.campaignContact.updateMany({
          where: { campaignId: campaign.id, contactId: contact.id, status: "STAGED" },
          data: {
            vesselId: vesselByContact.get(contact.id)!,
            status: "PENDING",
            stagedAt: null,
            stagedReason: null,
          },
        });
      }

      const vesselIds = Array.from(
        new Set(
          attributable
            .map((contact) => vesselByContact.get(contact.id))
            .filter((id): id is string => Boolean(id)),
        ),
      );
      const scheduled = await scheduleUpcomingEtasForCampaignVessels(campaign.id, vesselIds);

      console.log(
        `[list-reconciler] auto-enrolled ${attributable.length} ETA contact(s) campaign=${campaign.id} list=${listId} · scheduled ${scheduled} step(s)${deferred ? ` · ${deferred} deferred without a vessel match` : ""}.`,
      );
    }
  } catch (err) {
    console.warn(`[list-reconciler] failed for list=${listId}: ${(err as Error).message}`);
  }
}

/**
 * Which list vessel each contact belongs to. Uses the same union rule the ETA
 * scheduler uses: live matcher OR the
 * explicit matchedVesselIds pinned onto Apollo contacts when they were added
 * from the list's vessel-domain search (Apollo bridges related domains —
 * citi.com ↔ citibank.com — that the matcher can't reconnect from the
 * persisted contact alone).
 *
 * CampaignContact.vesselId is a single FK, so a contact matching two vessels
 * is attributed to the first. Contacts with no vessel signal stay unenrolled
 * until a later list update supplies an association that can drive an ETA.
 */
function mapContactsToVessels(
  contacts: Contact[],
  vessels: ListVesselWithCompanies[],
): Map<string, string> {
  const byContact = new Map<string, string>();
  for (const contact of contacts) {
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

/**
 * Attach and schedule ETA-campaign contacts that are enrolled but stranded:
 * status PENDING/SCHEDULED with vesselId = null. If such a contact now
 * resolves to a vessel on the list (its matchedVesselIds pin healed, or the
 * domain matcher now hits), we write the vesselId and schedule that vessel's
 * upcoming ETAs. Contacts that still can't be attributed are left untouched —
 * they genuinely have no vessel to fire against, and forcing a schedule would
 * be wrong.
 */
async function healStrandedEtaContacts(
  campaignId: string,
  resolvedContacts: Contact[],
  listVessels: ListVesselWithCompanies[],
): Promise<void> {
  const contactById = new Map(resolvedContacts.map((c) => [c.id, c]));

  // Only rows that are enrolled, not yet sent/terminal, and missing a vessel.
  const stranded = await prisma.campaignContact.findMany({
    where: {
      campaignId,
      vesselId: null,
      status: { in: ["PENDING", "SCHEDULED"] },
      contactId: { in: resolvedContacts.map((c) => c.id) },
    },
    select: { id: true, contactId: true },
  });
  if (stranded.length === 0) return;

  const healedVesselIds = new Set<string>();
  for (const row of stranded) {
    const contact = contactById.get(row.contactId);
    if (!contact) continue;
    const pinned = pinnedVesselIds(contact);
    const hit = listVessels.find(
      (vessel) => matchContactToVessel(contact, vessel) !== null || pinned.includes(vessel.id),
    );
    if (!hit) continue; // still unattributable — leave as-is
    await prisma.campaignContact.update({
      where: { id: row.id },
      data: { vesselId: hit.id },
    });
    healedVesselIds.add(hit.id);
  }

  if (healedVesselIds.size === 0) return;

  const scheduled = await scheduleUpcomingEtasForCampaignVessels(
    campaignId,
    Array.from(healedVesselIds),
  );
  console.log(
    `[list-reconciler] self-heal: attributed ${healedVesselIds.size} vessel(s) to stranded ETA contacts on campaign=${campaignId} · scheduled ${scheduled} step(s).`,
  );
}

function targetsList(targetConfig: Prisma.JsonValue, listId: string): boolean {
  if (!targetConfig || typeof targetConfig !== "object" || Array.isArray(targetConfig)) return false;
  const raw = (targetConfig as Record<string, unknown>).contactListIds;
  if (!Array.isArray(raw)) return false;
  return raw.some((id) => id === listId);
}

import { unstable_cache } from "next/cache";
import { prisma } from "@marimail/db";
import { getServerSession } from "@/lib/api";
import { matchContactToVessel } from "@/lib/vessel-contact-matcher";
import { enrichApolloContactsWithCachedWebsite } from "@/lib/apollo-contact-enrichment";

// The port dropdown list is global and effectively static — cache it for 60s so
// it isn't re-queried from Neon on every campaigns page render.
const getPortOptionsCached = unstable_cache(
  async () =>
    prisma.port.findMany({
      orderBy: { portName: "asc" },
      take: 100,
      select: { portCode: true, portName: true },
    }),
  ["campaign-port-options"],
  { revalidate: 60, tags: ["ports"] },
);

export type CampaignDashboardData = Awaited<
  ReturnType<typeof getCampaignDashboardData>
>;

// Apollo persists unrevealed people with a placeholder address. They resolve as
// campaign targets but get dropped at send time, so the review UI must not let
// them be confirmed — they'd enrol and then silently never receive anything.
const LOCKED_EMAIL_SUFFIX = "@unknown.local";

export type StagedGroup = {
  vessel: {
    id: string;
    vesselName: string;
    imoNumber: string;
    nextEta: string | null;
    nextEtaPort: string | null;
  } | null;
  companyNames: string[];
  contacts: Array<{
    contactId: string;
    firstName: string;
    lastName: string;
    email: string;
    title: string | null;
    companyName: string;
    emailStatus: string;
    locked: boolean;
  }>;
};

export async function getCampaignDashboardData(triggerFilter?: "MANUAL" | "ETA_BASED") {
  const session = await getServerSession();
  if (!session?.activeWorkspace) {
    return { campaigns: [], ports: [], lists: [] };
  }

  const workspaceId = session.activeWorkspace.id;
  try {
    // For the two split nav sections: MANUAL keeps only manual campaigns;
    // ETA_BASED keeps ETA/PORT/vessel/cargo variants together since they all
    // route through the ETA matcher.
    const triggerWhere =
      triggerFilter === "MANUAL"
        ? { triggerType: "MANUAL" as const }
        : triggerFilter === "ETA_BASED"
          ? { triggerType: { not: "MANUAL" as const } }
          : {};

    const [campaigns, ports, lists] = await Promise.all([
      prisma.campaign.findMany({
        where: { workspaceId, ...triggerWhere },
        orderBy: { createdAt: "desc" },
        include: {
          sequences: { orderBy: { stepOrder: "asc" } },
          _count: {
            select: {
              // Staged candidates aren't members yet — don't count them as
              // enrolled contacts on the campaigns list.
              contacts: { where: { status: { not: "STAGED" } } },
              emailEvents: true,
              etaTriggers: true,
            },
          },
        },
      }),
      getPortOptionsCached(),
      prisma.contactList.findMany({
        where: { workspaceId, isArchived: false },
        orderBy: { name: "asc" },
        select: { id: true, name: true, contactCount: true },
      }),
    ]);

    const listCountById = new Map(lists.map((list) => [list.id, list.contactCount]));

    return {
      campaigns: campaigns.map((campaign) => {
        const targetConfig = parseCampaignTargetConfig(campaign.targetConfig);
        const targetedFromLists = targetConfig.contactListIds.reduce(
          (sum, listId) => sum + (listCountById.get(listId) ?? 0),
          0,
        );
        const targeted = targetConfig.contactIds.length + targetedFromLists;
        return {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          status: campaign.status,
          triggerType: campaign.triggerType,
          sendingMode: campaign.sendingMode,
          rotationStrategy: campaign.rotationStrategy,
          dailyLimit: campaign.dailyLimit,
          defaultDaysBefore: campaign.defaultDaysBefore,
          sequences: campaign.sequences.map((sequence) => ({
            id: sequence.id,
            stepOrder: sequence.stepOrder,
            subject: sequence.subject,
            delayValue: sequence.delayValue,
            conditionType: sequence.conditionType,
            abTestEnabled: sequence.abTestEnabled,
          })),
          counts: {
            contacts: campaign._count.contacts,
            targeted,
            events: campaign._count.emailEvents,
            triggers: campaign._count.etaTriggers,
          },
        };
      }),
      ports,
      lists,
    };
  } catch (err) {
    console.error("[campaigns] getCampaignDashboardData failed:", err);
    return { campaigns: [], ports: [], lists: [] };
  }
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseCampaignTargetConfig(value: unknown) {
  if (!value || typeof value !== "object") {
    return { roles: [], contactListIds: [], contactIds: [] };
  }
  const config = value as Record<string, unknown>;
  return {
    roles: stringArray(config.roles),
    contactListIds: stringArray(config.contactListIds),
    contactIds: stringArray(config.contactIds),
  };
}

export type StepMailRow = {
  contactId: string;
  name: string;
  email: string;
  companyName: string | null;
  /** SENT once a delivery event exists for this (step, contact); FAILED on a
   *  bounce/failure; SCHEDULED when we know the send time; PENDING otherwise. */
  state: "SENT" | "FAILED" | "SCHEDULED" | "PENDING";
  /** When it went out (SENT) or is due (SCHEDULED/PENDING). Null if unknown. */
  at: string | null;
  /** True when `at` is derived from the step delay rather than a real queued
   *  time — manual campaigns only persist nextSendAt for the current step. */
  projected: boolean;
  vesselName: string | null;
  vesselImo: string | null;
};

export type StepBreakdownRow = {
  sequenceId: string;
  stepOrder: number;
  subject: string;
  delayType: string;
  delayValue: number;
  toGo: number;
  sent: number;
  pending: number;
  failed: number;
  /** Soonest upcoming send across this step's recipients, for the summary line. */
  nextAt: string | null;
  nextAtProjected: boolean;
  mails: StepMailRow[];
};

const STEP_SENT_EVENTS = new Set(["SENT", "DELIVERED", "OPENED", "CLICKED", "REPLIED"]);
const STEP_FAILED_EVENTS = new Set(["BOUNCED_HARD", "BOUNCED_SOFT", "FAILED", "SPAM"]);

function parseStepFireTimes(value: unknown): Array<{ stepOrder: number; fireAt: string }> {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is { stepOrder: number; fireAt: string } =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).stepOrder === "number" &&
      typeof (item as Record<string, unknown>).fireAt === "string",
  );
}

/**
 * One row per sequence step, each listing every recipient's mail for that step.
 *
 * The campaign detail table only ever showed each contact's *next* step, so
 * steps 2+ were invisible until step 1 completed. This flips it: every step is
 * always listed with its own to-go / sent / pending counts.
 *
 * Send times: ETA campaigns persist every step's fire time on the trigger, so
 * those are exact. Manual campaigns only persist `nextSendAt` for the current
 * step (later steps live in the job queue), so future steps are projected from
 * the step delay and flagged `projected` for the UI to label.
 */
function buildStepBreakdown(
  campaign: {
    sequences: Array<{
      id: string;
      stepOrder: number;
      subject: string;
      delayType: string;
      delayValue: number;
    }>;
    contacts: Array<{
      contactId: string;
      nextSendAt: Date | null;
      sequenceId: string | null;
      contact: { firstName: string; lastName: string; email: string; companyName: string };
      vessel: { vesselName: string; imoNumber: string } | null;
      etaTrigger: {
        stepFireTimes: unknown;
        vessel: { vesselName: string; imoNumber: string } | null;
      } | null;
    }>;
  },
  stepEvents: Array<{
    sequenceId: string | null;
    contactId: string;
    eventType: string;
    occurredAt: Date;
  }>,
): StepBreakdownRow[] {
  const sent = new Set<string>();
  const failed = new Set<string>();
  const sentAt = new Map<string, Date>();
  for (const event of stepEvents) {
    if (!event.sequenceId) continue;
    const key = `${event.sequenceId}:${event.contactId}`;
    if (STEP_SENT_EVENTS.has(event.eventType)) {
      sent.add(key);
      const prev = sentAt.get(key);
      if (!prev || event.occurredAt < prev) sentAt.set(key, event.occurredAt);
    } else if (STEP_FAILED_EVENTS.has(event.eventType)) {
      failed.add(key);
    }
  }

  return campaign.sequences.map((sequence, index) => {
    // Cumulative delay from step 1 — mirrors the scheduler, which advances a
    // running total across steps rather than treating each delay as absolute.
    const cumulativeDays = campaign.sequences
      .slice(0, index + 1)
      .reduce((total, step) => total + step.delayValue, 0);

    const mails: StepMailRow[] = campaign.contacts.map((row) => {
      const key = `${sequence.id}:${row.contactId}`;
      const vessel = row.vessel ?? row.etaTrigger?.vessel ?? null;
      const base: Omit<StepMailRow, "state" | "at" | "projected"> = {
        contactId: row.contactId,
        name: [row.contact.firstName, row.contact.lastName].filter(Boolean).join(" ") || row.contact.email,
        email: row.contact.email,
        companyName: row.contact.companyName ?? null,
        vesselName: vessel?.vesselName ?? null,
        vesselImo: vessel?.imoNumber ?? null,
      };

      if (sent.has(key)) {
        return { ...base, state: "SENT", at: sentAt.get(key)?.toISOString() ?? null, projected: false };
      }
      if (failed.has(key)) {
        return { ...base, state: "FAILED", at: null, projected: false };
      }

      // Exact time when the ETA trigger already computed this step's fire time.
      const fireAt = parseStepFireTimes(row.etaTrigger?.stepFireTimes).find(
        (time) => time.stepOrder === sequence.stepOrder,
      );
      if (fireAt) {
        return { ...base, state: "SCHEDULED", at: fireAt.fireAt, projected: false };
      }

      // Exact time for the one step this contact is currently queued for.
      if (row.sequenceId === sequence.id && row.nextSendAt) {
        return { ...base, state: "SCHEDULED", at: row.nextSendAt.toISOString(), projected: false };
      }

      // Later manual step: project from the current step's queued time plus the
      // remaining delay. Without a known anchor there's nothing honest to show.
      if (row.nextSendAt && row.sequenceId) {
        const anchorIndex = campaign.sequences.findIndex((step) => step.id === row.sequenceId);
        if (anchorIndex !== -1 && index > anchorIndex) {
          const anchorCumulative = campaign.sequences
            .slice(0, anchorIndex + 1)
            .reduce((total, step) => total + step.delayValue, 0);
          const deltaDays = cumulativeDays - anchorCumulative;
          const projectedAt = new Date(row.nextSendAt.getTime() + deltaDays * 86_400_000);
          return { ...base, state: "PENDING", at: projectedAt.toISOString(), projected: true };
        }
      }

      return { ...base, state: "PENDING", at: null, projected: false };
    });

    const sentCount = mails.filter((mail) => mail.state === "SENT").length;
    const failedCount = mails.filter((mail) => mail.state === "FAILED").length;
    const pendingCount = mails.length - sentCount - failedCount;
    const upcoming = mails
      .filter((mail) => (mail.state === "SCHEDULED" || mail.state === "PENDING") && mail.at)
      .sort((a, b) => new Date(a.at!).getTime() - new Date(b.at!).getTime())[0];

    return {
      sequenceId: sequence.id,
      stepOrder: sequence.stepOrder,
      subject: sequence.subject,
      delayType: sequence.delayType,
      delayValue: sequence.delayValue,
      toGo: mails.length,
      sent: sentCount,
      pending: pendingCount,
      failed: failedCount,
      nextAt: upcoming?.at ?? null,
      nextAtProjected: upcoming?.projected ?? false,
      mails,
    };
  });
}

export async function getCampaignDetailData(campaignId: string) {
  const session = await getServerSession();
  if (!session?.activeWorkspace) return null;

  const workspaceId = session.activeWorkspace.id;
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      include: {
        sequences: {
          orderBy: { stepOrder: "asc" },
          include: {
            _count: { select: { campaignContacts: true, emailEvents: true } },
          },
        },
        contacts: {
          // STAGED rows are candidates awaiting review, not campaign members —
          // they'd otherwise show up as enrolled leads and inflate the KPIs.
          where: { status: { not: "STAGED" } },
          orderBy: [{ nextSendAt: "asc" }, { updatedAt: "desc" }],
          take: 500,
          include: {
            contact: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                companyName: true,
                title: true,
                emailStatus: true,
              },
            },
            sequence: {
              select: {
                id: true,
                stepOrder: true,
                subject: true,
                delayType: true,
                delayValue: true,
              },
            },
            vessel: {
              select: {
                id: true,
                imoNumber: true,
                vesselName: true,
                vesselType: true,
              },
            },
            etaTrigger: {
              include: {
                vessel: {
                  select: {
                    imoNumber: true,
                    vesselName: true,
                    vesselType: true,
                  },
                },
                vesselEta: {
                  include: {
                    port: {
                      select: {
                        portCode: true,
                        portName: true,
                        country: true,
                      },
                    },
                  },
                },
              },
            },
            events: {
              orderBy: { occurredAt: "desc" },
              take: 5,
              include: {
                sequence: {
                  select: { id: true, stepOrder: true, subject: true },
                },
              },
            },
          },
        },
        emailEvents: {
          orderBy: { occurredAt: "desc" },
          take: 200,
          include: {
            contact: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                companyName: true,
              },
            },
            sequence: {
              select: { id: true, stepOrder: true, subject: true },
            },
          },
        },
        etaTriggers: {
          orderBy: [{ nextFireAt: "asc" }, { createdAt: "desc" }],
          take: 100,
          include: {
            vessel: {
              select: {
                imoNumber: true,
                vesselName: true,
                vesselType: true,
              },
            },
            vesselEta: {
              include: {
                port: {
                  select: {
                    portCode: true,
                    portName: true,
                    country: true,
                  },
                },
              },
            },
            campaignContacts: {
              select: { id: true, status: true, contactId: true },
            },
          },
        },
        portRules: {
          include: { port: { select: { portCode: true, portName: true } } },
          orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        },
        cargoTriggers: { orderBy: { createdAt: "desc" } },
        _count: {
          select: {
            // Staged candidates aren't members yet — see `contacts` above.
            contacts: { where: { status: { not: "STAGED" } } },
            emailEvents: true,
            etaTriggers: true,
          },
        },
      },
    });

    if (!campaign) return null;

    const targetConfig = parseCampaignTargetConfig(campaign.targetConfig);
    const [targetContacts, targetLists, targetVessels, stepEvents, stagedRows] = await Promise.all([
      targetConfig.contactIds.length
        ? prisma.contact.findMany({
            where: {
              id: { in: targetConfig.contactIds },
              OR: [{ workspaceId }, { workspaceId: null }],
            },
            orderBy: [{ companyName: "asc" }, { firstName: "asc" }],
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              secondaryEmail: true,
              website: true,
              companyName: true,
              title: true,
              emailStatus: true,
              // Needed for Apollo-cache website enrichment below — old rows
              // saved without a website can be repaired at read time.
              source: true,
              customFields: true,
            },
          })
        : Promise.resolve([]),
      targetConfig.contactListIds.length
        ? prisma.contactList.findMany({
            where: {
              id: { in: targetConfig.contactListIds },
              workspaceId,
              isArchived: false,
            },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              contactCount: true,
              contacts: {
                select: {
                  contact: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      email: true,
                      secondaryEmail: true,
                      website: true,
                      companyName: true,
                      title: true,
                      emailStatus: true,
                      source: true,
                      customFields: true,
                    },
                  },
                },
                orderBy: { createdAt: "asc" },
                take: 500,
              },
            },
          })
        : Promise.resolve([]),
      // Vessels linked to the target lists — the trigger source for ETA
      // campaigns. Full company rows are pulled so contact↔vessel association
      // (email domain / company website / company name) can be computed below.
      // Cross-workspace visible because ETAs and their vessels are global
      // after the workspace scope change.
      targetConfig.contactListIds.length
        ? prisma.vessel.findMany({
            where: {
              listMemberships: { some: { listId: { in: targetConfig.contactListIds } } },
            },
            orderBy: { vesselName: "asc" },
            include: {
              shipOwnerCompany: true,
              ismManagerCompany: true,
              commercialManagerCompany: true,
              // Next upcoming ETA (soonest in the future) — this is the moment
              // the campaign fires for this vessel, surfaced per-contact so the
              // user knows WHEN each recipient will be mailed.
              etas: {
                where: { eta: { gt: new Date() } },
                orderBy: { eta: "asc" },
                take: 1,
                select: { eta: true, destinationPortName: true, destinationPort: true },
              },
            },
            take: 200,
          })
        : Promise.resolve([]),
      // Per-(step, contact) delivery facts. `campaign.emailEvents` above is
      // capped at 200 for the activity feed, so it can't be used to count —
      // this pulls the minimal columns for every event instead, which is what
      // makes the per-step Sent/Pending totals correct on a large campaign.
      prisma.emailEvent.findMany({
        where: { campaignId, sequenceId: { not: null } },
        select: { sequenceId: true, contactId: true, eventType: true, occurredAt: true },
      }),
      // Candidates pulled in by a list change since this campaign went live.
      // They are not members and nothing sends to them until confirmed — see
      // the reconciler and the campaign's /staged routes.
      prisma.campaignContact.findMany({
        where: { campaignId, status: "STAGED" },
        include: {
          contact: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              companyName: true,
              title: true,
              emailStatus: true,
            },
          },
          vessel: {
            include: {
              shipOwnerCompany: { select: { companyName: true } },
              ismManagerCompany: { select: { companyName: true } },
              commercialManagerCompany: { select: { companyName: true } },
              etas: {
                where: { eta: { gt: new Date() } },
                orderBy: { eta: "asc" },
                take: 1,
                select: { eta: true, destinationPortName: true, destinationPort: true },
              },
            },
          },
        },
        orderBy: [{ stagedAt: "desc" }, { createdAt: "desc" }],
        take: 500,
      }),
    ]);

    const targetContactsById = new Map(
      targetContacts.map((contact) => [contact.id, contact]),
    );
    for (const list of targetLists) {
      for (const membership of list.contacts) {
        targetContactsById.set(membership.contact.id, membership.contact);
      }
    }
    // Backfill website from ApolloRevealCache for Apollo-source rows that were
    // saved before we started persisting website — this is what lets the
    // Ship / ETA badge appear next to Apollo contacts without re-adding them.
    const allTargetContacts = await enrichApolloContactsWithCachedWebsite(
      Array.from(targetContactsById.values()),
    );

    // Contact↔vessel association: live matcher UNION the explicit
    // matchedVesselIds pinned onto Apollo contacts at add time (the search
    // knew which vessel domains produced the hit; the matcher alone can't
    // always reconnect them, e.g. Apollo bridging citi.com↔citibank.com).
    const explicitVesselIds = (contact: { customFields?: unknown }): string[] => {
      const fields = contact.customFields;
      if (!fields || typeof fields !== "object") return [];
      const ids = (fields as Record<string, unknown>).matchedVesselIds;
      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
    };
    const vesselRows = targetVessels.map((vessel) => {
      const matchedContactIds = allTargetContacts
        .filter(
          (contact) =>
            matchContactToVessel(contact, vessel) !== null ||
            explicitVesselIds(contact).includes(vessel.id),
        )
        .map((contact) => contact.id);
      const nextEta = vessel.etas[0] ?? null;
      return {
        id: vessel.id,
        vesselName: vessel.vesselName,
        imoNumber: vessel.imoNumber,
        vesselType: vessel.vesselType,
        currentPortUnlocode: vessel.currentPortUnlocode,
        nextEta: nextEta ? nextEta.eta.toISOString() : null,
        nextEtaPort: nextEta ? nextEta.destinationPortName || nextEta.destinationPort : null,
        matchedContactIds,
      };
    });

    // Group staged candidates under the vessel that surfaced them. vesselId
    // null means no vessel signal linked them — they still need reviewing, so
    // they collect in an "Other" bucket rather than being dropped.
    const stagedGroups = new Map<string, StagedGroup>();
    for (const row of stagedRows) {
      const key = row.vesselId ?? "__none__";
      if (!stagedGroups.has(key)) {
        const nextEta = row.vessel?.etas[0] ?? null;
        stagedGroups.set(key, {
          vessel: row.vessel
            ? {
                id: row.vessel.id,
                vesselName: row.vessel.vesselName,
                imoNumber: row.vessel.imoNumber,
                nextEta: nextEta ? nextEta.eta.toISOString() : null,
                nextEtaPort: nextEta ? nextEta.destinationPortName || nextEta.destinationPort : null,
              }
            : null,
          companyNames: row.vessel
            ? Array.from(
                new Set(
                  [
                    row.vessel.shipOwnerCompany?.companyName,
                    row.vessel.ismManagerCompany?.companyName,
                    row.vessel.commercialManagerCompany?.companyName,
                  ].filter((name): name is string => Boolean(name)),
                ),
              )
            : [],
          contacts: [],
        });
      }
      stagedGroups.get(key)!.contacts.push({
        contactId: row.contactId,
        firstName: row.contact.firstName,
        lastName: row.contact.lastName,
        email: row.contact.email,
        title: row.contact.title,
        companyName: row.contact.companyName,
        emailStatus: row.contact.emailStatus,
        locked: row.contact.email.toLowerCase().endsWith(LOCKED_EMAIL_SUFFIX),
      });
    }

    const stepBreakdown = buildStepBreakdown(campaign, stepEvents);

    return {
      campaign,
      targetConfig,
      stepBreakdown,
      targetContacts: allTargetContacts.sort((a, b) =>
        `${a.companyName} ${a.firstName} ${a.lastName}`.localeCompare(
          `${b.companyName} ${b.firstName} ${b.lastName}`,
        ),
      ),
      targetLists,
      targetVessels: vesselRows,
      stagedGroups: Array.from(stagedGroups.values()),
    };
  } catch (err) {
    console.error("[campaigns] getCampaignDetailData failed:", err);
    return null;
  }
}

export type CampaignDetailData = NonNullable<
  Awaited<ReturnType<typeof getCampaignDetailData>>
>;

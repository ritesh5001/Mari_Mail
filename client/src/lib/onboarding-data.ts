import { cache } from "react";
import { prisma } from "@marimail/db";
import type {
  CampaignItineraryProgress,
  CampaignItineraryStep,
} from "@/lib/onboarding-types";

type CampaignCandidate = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";
  targetConfig: unknown;
  setupLeadsCompletedAt: Date | null;
  setupSequenceCompletedAt: Date | null;
  setupOptionsCompletedAt: Date | null;
  updatedAt: Date;
};

function listIdsFromTargetConfig(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const ids = (value as Record<string, unknown>).contactListIds;
  return Array.isArray(ids)
    ? ids.filter((id): id is string => typeof id === "string")
    : [];
}

function wasLaunched(status: CampaignCandidate["status"]): boolean {
  return status === "ACTIVE" || status === "PAUSED" || status === "COMPLETED";
}

function isRenamed(name: string): boolean {
  return name.trim().length > 0 && !/^untitled\b/i.test(name.trim());
}

function campaignScore(campaign: CampaignCandidate): number {
  return (
    (wasLaunched(campaign.status) ? 1_000 : 0) +
    (campaign.setupOptionsCompletedAt ? 100 : 0) +
    (campaign.setupSequenceCompletedAt ? 50 : 0) +
    (campaign.setupLeadsCompletedAt ? 25 : 0) +
    (listIdsFromTargetConfig(campaign.targetConfig).length ? 15 : 0) +
    (isRenamed(campaign.name) ? 10 : 0)
  );
}

function unavailableProgress(): CampaignItineraryProgress {
  return {
    available: false,
    isComplete: true,
    completedCount: 0,
    total: 0,
    remainingCount: 0,
    campaignName: null,
    listName: null,
    steps: [],
    nextStep: null,
  };
}

/**
 * The first ETA-campaign journey, derived from durable workspace data.
 *
 * The list is user-owned because the Lists UI enforces that same ownership
 * boundary. Inbox and campaign progress are workspace-wide: either can be
 * shared by the team, and a live ETA campaign means the workspace is already
 * activated even if its original creator later leaves.
 */
export const getCampaignItineraryProgress = cache(
  async (workspaceId: string, userId: string): Promise<CampaignItineraryProgress> => {
    try {
      const [inboxCount, etaLists, campaigns] = await Promise.all([
        prisma.emailAccount.count({
          where: {
            workspaceId,
            status: { in: ["ACTIVE", "WARMING"] },
            isPlatformDefault: false,
          },
        }),
        prisma.contactList.findMany({
          where: {
            workspaceId,
            ownerId: userId,
            isArchived: false,
            vessels: { some: {} },
          },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            _count: { select: { vessels: true } },
            contacts: {
              where: {
                contact: {
                  is: {
                    NOT: { email: { endsWith: "@unknown.local" } },
                    emailStatus: { not: "INVALID" },
                  },
                },
              },
              select: { id: true },
              take: 1,
            },
          },
        }),
        prisma.campaign.findMany({
          where: { workspaceId, triggerType: { not: "MANUAL" } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            name: true,
            status: true,
            targetConfig: true,
            setupLeadsCompletedAt: true,
            setupSequenceCompletedAt: true,
            setupOptionsCompletedAt: true,
            updatedAt: true,
          },
        }),
      ]);

      const campaign = campaigns
        .slice()
        .sort(
          (a, b) =>
            campaignScore(b) - campaignScore(a) || b.updatedAt.getTime() - a.updatedAt.getTime(),
        )[0] ?? null;
      const campaignListIds = campaign ? listIdsFromTargetConfig(campaign.targetConfig) : [];
      const selectedList = etaLists.find((list) => campaignListIds.includes(list.id)) ?? null;
      const primaryList =
        selectedList ?? etaLists.find((list) => list.contacts.length > 0) ?? etaLists[0] ?? null;

      // Any non-draft ETA campaign is definitive evidence that this one-time
      // setup has already succeeded. This also backfills legacy campaigns that
      // predate the explicit wizard timestamp columns.
      const launched = campaigns.some((item) => wasLaunched(item.status));
      const inboxConnected = inboxCount > 0;
      const vesselsSelected = Boolean(primaryList && primaryList._count.vessels > 0);
      const contactsAdded = Boolean(primaryList && primaryList.contacts.length > 0);
      const campaignPrepared = Boolean(
        campaign &&
          campaign.setupLeadsCompletedAt &&
          isRenamed(campaign.name) &&
          selectedList,
      );
      const sequenceConfigured = Boolean(campaignPrepared && campaign?.setupSequenceCompletedAt);
      const optionsConfigured = Boolean(sequenceConfigured && campaign?.setupOptionsCompletedAt);

      const rawCompleted = launched
        ? [true, true, true, true, true, true, true]
        : [
            inboxConnected,
            vesselsSelected,
            contactsAdded,
            campaignPrepared,
            sequenceConfigured,
            optionsConfigured,
            false,
          ];

      // Keep progress linear even if someone jumps around the campaign tabs:
      // only the uninterrupted completed prefix is shown as done, and the
      // earliest missing milestone remains the one clear next action.
      let prefixComplete = true;
      const completed = rawCompleted.map((value) => {
        const done = prefixComplete && value;
        if (!done) prefixComplete = false;
        return done;
      });
      const firstIncomplete = completed.findIndex((value) => !value);
      const editorHref = campaign
        ? `/dashboard/campaigns/${campaign.id}/edit?tab=leads`
        : "/dashboard/campaigns/eta/new";
      const campaignName = campaign && isRenamed(campaign.name) ? campaign.name : null;

      const definitions: Array<Omit<CampaignItineraryStep, "number" | "status">> = [
        {
          id: "connect-inbox",
          title: "Connect your sending inbox",
          shortTitle: "Connect an inbox",
          description:
            "Connect the mailbox MariMail will use to send outreach and receive replies.",
          why: "A verified sender is required before MariMail can create or launch a campaign.",
          action: "Connect inbox",
          href: "/dashboard/inboxes",
        },
        {
          id: "select-vessels",
          title: "Choose vessels in Port Radar",
          shortTitle: "Choose vessels",
          description:
            "Select the arrivals you care about, then add them to one ETA lead list.",
          why: "That vessel list becomes the live source feeding your ETA campaign.",
          action: "Open Port Radar",
          href: "/dashboard/port-radar",
        },
        {
          id: "find-contacts",
          title: "Find the right contacts",
          shortTitle: "Find contacts",
          description: primaryList
            ? `Open ${primaryList.name}, filter by the job titles you need, reveal matches, and add them.`
            : "Open your ETA list, filter by the job titles you need, reveal matches, and add them.",
          why: "Only revealed contacts with usable email addresses can enter outreach.",
          action: "Find contacts",
          href: primaryList ? `/dashboard/lists/${primaryList.id}` : "/dashboard/lists",
        },
        {
          id: "prepare-campaign",
          title: "Prepare your ETA campaign",
          shortTitle: "Prepare campaign",
          description: campaign
            ? "Rename the draft, choose the same vessel lead list, then save and continue."
            : "Create an ETA campaign, give it a clear name, and choose the lead list you prepared.",
          why: "Linking the list once is what lets future additions flow into the same campaign.",
          action: campaign ? "Continue campaign" : "Create ETA campaign",
          href: editorHref,
        },
        {
          id: "build-sequence",
          title: "Build your email sequence",
          shortTitle: "Build sequence",
          description: "Write the first email and add the follow-ups and ETA timing you need.",
          why: "Every contact added later will inherit this same message sequence.",
          action: "Build sequence",
          href: campaign
            ? `/dashboard/campaigns/${campaign.id}/edit?tab=sequences`
            : "/dashboard/campaigns/eta/new",
        },
        {
          id: "configure-options",
          title: "Choose your sending options",
          shortTitle: "Choose options",
          description:
            "Review the inbox rotation, sending window, pacing, tracking, and auto-stop rules.",
          why: "These settings protect deliverability and stay attached to future contacts.",
          action: "Review options",
          href: campaign
            ? `/dashboard/campaigns/${campaign.id}/edit?tab=options`
            : "/dashboard/campaigns/eta/new",
        },
        {
          id: "launch-campaign",
          title: "Launch your campaign",
          shortTitle: "Launch campaign",
          description: "Review the setup once, then launch the ETA campaign.",
          why: "After launch, new contacts from the linked list can join with the same settings.",
          action: "Review and launch",
          href: campaign
            ? `/dashboard/campaigns/${campaign.id}/edit?tab=options`
            : "/dashboard/campaigns/eta/new",
        },
      ];

      const steps = definitions.map((step, index): CampaignItineraryStep => ({
        ...step,
        number: index + 1,
        status: completed[index]
          ? "complete"
          : index === firstIncomplete
            ? "current"
            : "locked",
      }));
      const nextStep = steps.find((step) => step.status === "current") ?? null;
      const completedCount = completed.filter(Boolean).length;

      return {
        available: true,
        isComplete: launched,
        completedCount,
        total: steps.length,
        remainingCount: steps.length - completedCount,
        campaignName,
        listName: primaryList?.name ?? null,
        steps,
        nextStep,
      };
    } catch (error) {
      console.error("[onboarding] getCampaignItineraryProgress failed", error);
      // This guide is a nudge, not an access gate. On a database/schema issue,
      // hide its reminders instead of falsely telling an established customer
      // that they have work left.
      return unavailableProgress();
    }
  },
);

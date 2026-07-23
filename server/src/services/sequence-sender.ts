import {
  prisma,
  Prisma,
  type Campaign,
  type CampaignSequence,
  type Contact,
} from "@marimail/db";
import {
  bodyToHtml,
  plainTextFromHtml,
  renderTemplate,
  withTracking,
} from "@marimail/email";
import { createSignedToken, randomToken } from "@marimail/utils";
import {
  buildTransport,
  getTodaySent,
  incrementTodaySent,
  markInboxSent,
  reserveInboxSendSlot,
  resolveFromAddress,
} from "./email-account.service.js";
import { getToken, incrementToken } from "./token-store.js";

/**
 * Shared sending core used by BOTH the ETA-triggered worker and the manual
 * (fixed-schedule) worker. The ETA code path must behave identically to the
 * pre-refactor worker: when `eta` context is present the personalization values
 * are built exactly as before (preserving nullable values); the `""` fallbacks
 * only apply to manual campaigns that have no vessel/ETA context.
 */

export type EtaSendContext = {
  eta: Date;
  destinationPortName: string;
  previousCargo: string | null;
  nextCargo: string | null;
  port?: { region: string } | null;
  vessel: {
    vesselName: string;
    imoNumber: string;
    vesselType: string;
    dwt: number | null;
    flag: string | null;
    shipOwnerCompany?: { companyName: string } | null;
  };
};

export { buildTransport };

export async function selectInbox(
  workspaceId: string,
  accountIds: string[],
  strategy: string,
) {
  // Campaign sends must go from a user-connected mailbox, never the platform
  // Resend inbox — otherwise replies go to no-reply and the message doesn't
  // appear in the sender's Sent folder. The workspaceHasSendingInbox gate
  // blocks campaign launch when no user inbox is connected, so by the time
  // we get here at least one non-platform inbox should exist.
  const accounts = await prisma.emailAccount.findMany({
    where: {
      workspaceId,
      status: { in: ["ACTIVE", "WARMING"] },
      isPlatformDefault: false,
      id: accountIds.length ? { in: accountIds } : undefined,
    },
    orderBy: { createdAt: "asc" },
  });
  const sentCounts = new Map(
    await Promise.all(
      accounts.map(
        async (account) =>
          [account.id, await getTodaySent(account.id)] as const,
      ),
    ),
  );
  const available = accounts.filter(
    (account) => (sentCounts.get(account.id) ?? 0) < account.dailyLimit,
  );
  if (!available.length) return null;
  if (strategy === "LEAST_USED") {
    return (
      available.sort(
        (a, b) =>
          (sentCounts.get(a.id) ?? 0) - (sentCounts.get(b.id) ?? 0) ||
          b.healthScore - a.healthScore,
      )[0] ?? null
    );
  }
  if (strategy === "WEIGHTED") {
    const pool = available.flatMap((account) =>
      Array.from(
        { length: Math.max(account.rotationWeight, 1) },
        () => account,
      ),
    );
    return (
      pool[Math.floor(Math.random() * pool.length)] ?? available[0] ?? null
    );
  }
  return (
    available.sort(
      (a, b) => (sentCounts.get(a.id) ?? 0) - (sentCounts.get(b.id) ?? 0),
    )[0] ?? null
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function displayEnum(value: string | null | undefined) {
  return value
    ? value
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase())
    : "";
}

export function buildPersonalization(
  contact: { firstName: string; companyName: string; title: string | null },
  eta: EtaSendContext | null | undefined,
) {
  // ETA path: preserve the exact original values (including nulls) so rendered
  // output is byte-identical to the pre-refactor worker.
  if (eta) {
    const days = Math.ceil((eta.eta.getTime() - Date.now()) / 86_400_000);
    return {
      vessel_name: eta.vessel.vesselName,
      imo_number: `IMO ${eta.vessel.imoNumber}`,
      vessel_type: displayEnum(eta.vessel.vesselType),
      dwt: eta.vessel.dwt ? `${eta.vessel.dwt.toLocaleString()} DWT` : "",
      flag: eta.vessel.flag,
      eta_port: eta.destinationPortName,
      eta_date: formatDate(eta.eta),
      eta_days:
        days === 0
          ? "today"
          : `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}${days < 0 ? " ago" : ""}`,
      previous_cargo: eta.previousCargo,
      next_cargo: eta.nextCargo,
      ship_owner: eta.vessel.shipOwnerCompany?.companyName,
      first_name: contact.firstName,
      company: contact.companyName,
      title: contact.title,
      port_region: displayEnum(eta.port?.region),
    };
  }

  // Manual path: no vessel/ETA context — vessel_* and eta_* render blank.
  return {
    vessel_name: "",
    imo_number: "",
    vessel_type: "",
    dwt: "",
    flag: "",
    eta_port: "",
    eta_date: "",
    eta_days: "",
    previous_cargo: "",
    next_cargo: "",
    ship_owner: "",
    first_name: contact.firstName,
    company: contact.companyName,
    title: contact.title,
    port_region: "",
  };
}

export async function findSuppression(workspaceId: string, email: string) {
  return prisma.globalSuppression.findFirst({
    where: {
      email: email.toLowerCase(),
      OR: [{ workspaceId }, { workspaceId: null }],
    },
  });
}

export async function shouldSkip(input: {
  campaignContactId: string;
  campaignId: string;
  contactId: string;
  conditionType: string;
}) {
  const campaignContact = await prisma.campaignContact.findUnique({
    where: { id: input.campaignContactId },
  });
  if (
    !campaignContact ||
    ["REPLIED", "BOUNCED", "UNSUBSCRIBED", "FAILED", "PAUSED"].includes(
      campaignContact.status,
    )
  ) {
    return true;
  }

  if (input.conditionType === "IF_NOT_REPLIED") {
    const replied = await prisma.emailEvent.findFirst({
      where: {
        campaignId: input.campaignId,
        contactId: input.contactId,
        eventType: "REPLIED",
      },
    });
    return Boolean(replied);
  }

  if (input.conditionType === "IF_NOT_OPENED") {
    const opened = await prisma.emailEvent.findFirst({
      where: {
        campaignId: input.campaignId,
        contactId: input.contactId,
        eventType: "OPENED",
      },
    });
    return Boolean(opened);
  }

  return false;
}

function useVariantB(contactId: string, split: number) {
  const score =
    contactId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    100;
  return score >= split;
}

type CampaignSendFields = Pick<
  Campaign,
  | "id"
  | "workspaceId"
  | "fromName"
  | "fromAccountIds"
  | "rotationStrategy"
  | "trackOpens"
  | "trackClicks"
  | "dailyLimit"
>;

function campaignDailyCounterKey(campaignId: string) {
  return `campaign:${campaignId}:sent:${new Date().toISOString().slice(0, 10)}`;
}

// Picks a fresh random gap (ms) in [min, max] seconds for human-like pacing —
// same formula the manual scheduler uses for the campaign-level gap.
function randomGapMs(minSeconds: number, maxSeconds: number) {
  const min = Math.max(0, minSeconds);
  const max = Math.max(min, maxSeconds);
  const seconds =
    max > min ? min + Math.floor(Math.random() * (max - min + 1)) : min;
  return seconds * 1000;
}

/**
 * Selects an inbox, renders the personalized email, sends it, and records the
 * resulting EmailEvent + CampaignContact + inbox usage. The caller is
 * responsible for having already upserted the CampaignContact and run the
 * suppression / condition checks.
 */
export async function sendSequenceStep(args: {
  campaign: CampaignSendFields;
  sequence: CampaignSequence;
  contact: Contact;
  campaignContactId: string;
  eta?: EtaSendContext | null;
  scheduledFor: string;
  /**
   * Reservation slot carried across defers. When present, this job has
   * already claimed a spot on the target inbox's send queue and the
   * reservation MUST NOT be re-taken (each re-take advances the counter and
   * pushes every subsequent worker further out — a runaway seen in the
   * gap-test simulation). We only wait until `now >= reservedSlotAt` and
   * then send. Absent → this is the first attempt; run a fresh reservation.
   */
  reservedSlotAt?: number | null;
}) {
  const { campaign, sequence, contact, campaignContactId } = args;
  const campaignSent = Number(
    (await getToken(campaignDailyCounterKey(campaign.id))) ?? 0,
  );
  if (campaignSent >= campaign.dailyLimit) {
    throw new Error("Campaign daily sending limit reached");
  }

  const inbox = await selectInbox(
    campaign.workspaceId,
    campaign.fromAccountIds,
    campaign.rotationStrategy,
  );
  if (!inbox) {
    throw new Error("No active sending inbox available");
  }

  // Per-inbox send-gap: enforce at least a randomized [min,max]s cooldown between
  // two consecutive sends from THIS mailbox. Rotation picks the inbox here at
  // send time, so this send-time lock is the only place that can guarantee the
  // real spacing regardless of which campaign queued the job.
  //
  // Correctness fix: the previous version was a read-then-check-then-send
  // sequence. When two workers pulled jobs for the same inbox in the same
  // tick they BOTH read the old lastSentAt, both saw the gap had elapsed,
  // and both proceeded — producing two mails at the same timestamp. See the
  // report showing "Hongpeng Liu" and "Gaskell Chan" both sent at 01:08 pm.
  //
  // Now we atomically RESERVE the next available slot for this inbox in one
  // Redis round-trip: the second reservation is forced to sit `gap` seconds
  // after the first, regardless of how tightly the workers are racing.
  // `reserveInboxSendSlot` returns the ms-timestamp at which this job may
  // send. If it's in the future we defer the job to fire again at that time.
  if (inbox.sendGapMinSeconds > 0 || inbox.sendGapMaxSeconds > 0) {
    let sendAt: number;
    if (typeof args.reservedSlotAt === "number" && Number.isFinite(args.reservedSlotAt)) {
      // Retry — reuse the slot the first attempt already claimed. Skipping
      // reserveInboxSendSlot here is what prevents the "each retry eats
      // another slot" cascade the initial simulation exposed.
      sendAt = args.reservedSlotAt;
    } else {
      const gapMs = randomGapMs(inbox.sendGapMinSeconds, inbox.sendGapMaxSeconds);
      sendAt = await reserveInboxSendSlot(inbox.id, gapMs / 1000);
    }
    const waitMs = sendAt - Date.now();
    if (waitMs > 0) {
      return {
        deferred: true,
        retryAfterMs: waitMs,
        reservedSlotAt: sendAt,
      } as const;
    }
  }

  const values = buildPersonalization(contact, args.eta ?? null);
  const variantB =
    sequence.abTestEnabled && useVariantB(contact.id, sequence.abSplit);
  const subject = renderTemplate(
    variantB && sequence.abSubjectB ? sequence.abSubjectB : sequence.subject,
    values,
  );
  // Substitute merge tags in the raw text FIRST, then convert to HTML so
  // paragraph and line breaks the user typed in the textarea actually
  // survive to the recipient's inbox. Without this the body arrived as
  // one wall of text (HTML collapses whitespace).
  const rawBody = renderTemplate(
    variantB && sequence.abBodyHtmlB ? sequence.abBodyHtmlB : sequence.bodyHtml,
    values,
  );
  const rawHtml = bodyToHtml(rawBody);
  const trackingId = randomToken(16);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const unsubscribeToken = createSignedToken({
    workspaceId: campaign.workspaceId,
    email: contact.email.toLowerCase(),
  });
  const unsubscribeUrl = `${appUrl}/unsubscribe/${unsubscribeToken}`;
  const bodyHtml = withTracking(
    `${rawHtml}<p><a href="${unsubscribeUrl}">Unsubscribe</a></p>`,
    appUrl,
    trackingId,
    {
      opens: campaign.trackOpens,
      clicks: campaign.trackClicks,
    },
  );

  // Prefer the raw text the user typed for the plain-text alternate —
  // it already has the correct line breaks. Only fall back to stripping
  // HTML if the caller explicitly authored a separate bodyText. Computed
  // up here so the same value goes on the wire AND into SentMessage.
  const plainText = sequence.bodyText
    ? renderTemplate(sequence.bodyText, values)
    : rawBody || plainTextFromHtml(bodyHtml);

  // resolveFromAddress validates the raw address shape; a campaign-level
  // fromName override still routes through the same shape check by falling
  // through to resolveFromAddress when the inbox address is clean, and by
  // throwing early when it isn't. Hoisted here so both the transport call
  // and the SentMessage write see the same values.
  const resolvedInboxFrom = resolveFromAddress(inbox);
  const cleanAddress = inbox.fromEmail?.trim() || inbox.email.trim();
  const fromAddress = campaign.fromName
    ? `${campaign.fromName} <${cleanAddress}>`
    : resolvedInboxFrom;

  try {
    const transport = await buildTransport(inbox);
    const result = await transport.sendMail({
      from: fromAddress,
      to: contact.email,
      subject,
      html: bodyHtml,
      text: plainText,
      // Replies go straight back to the sending mailbox so the recipient's
      // reply lands in the user's own inbox (not a platform inbound-tracking
      // address). Reply threading via the platform is intentionally disabled
      // for user-mailbox sends.
      replyTo: fromAddress,
      headers: {
        "List-Unsubscribe": `<mailto:unsub@marimail.io?subject=${unsubscribeToken}>, <${unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    await prisma.$transaction([
      prisma.emailEvent.create({
        data: {
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          contactId: contact.id,
          sequenceId: sequence.id,
          campaignContactId,
          messageId: result.messageId,
          trackingId,
          eventType: "SENT",
          metadata: {
            variant: variantB ? "B" : "A",
            inboxId: inbox.id,
            scheduledFor: args.scheduledFor,
          } as Prisma.InputJsonValue,
        },
      }),
      // Store exactly what went out so the campaign detail page's inbox-style
      // viewer can show the real message per recipient — not a re-render of
      // the template. Upsert on (campaignContactId, stepOrder) so a retry that
      // eventually succeeds replaces the earlier attempt cleanly.
      prisma.sentMessage.upsert({
        where: {
          campaignContactId_stepOrder: {
            campaignContactId,
            stepOrder: sequence.stepOrder,
          },
        },
        create: {
          workspaceId: campaign.workspaceId,
          campaignId: campaign.id,
          campaignContactId,
          sequenceId: sequence.id,
          stepOrder: sequence.stepOrder,
          contactId: contact.id,
          inboxId: inbox.id,
          messageId: result.messageId,
          fromAddress,
          toAddress: contact.email,
          replyTo: fromAddress,
          subject,
          bodyHtml,
          bodyText: plainText,
          variant: variantB ? "B" : "A",
        },
        update: {
          sequenceId: sequence.id,
          contactId: contact.id,
          inboxId: inbox.id,
          messageId: result.messageId,
          fromAddress,
          toAddress: contact.email,
          replyTo: fromAddress,
          subject,
          bodyHtml,
          bodyText: plainText,
          variant: variantB ? "B" : "A",
          sentAt: new Date(),
        },
      }),
      prisma.campaignContact.update({
        where: { id: campaignContactId },
        data: {
          status: "SENT",
          currentStep: sequence.stepOrder,
          sequenceId: sequence.id,
          lastEventAt: new Date(),
          nextSendAt: null,
        },
      }),
      prisma.emailAccount.update({
        where: { id: inbox.id },
        data: { todaySent: { increment: 1 } },
      }),
    ]);
    await Promise.all([
      incrementTodaySent(inbox.id),
      incrementToken(campaignDailyCounterKey(campaign.id), 36 * 60 * 60),
      // Stamp the inbox's last-sent time so the next send from this mailbox
      // waits out a fresh randomized gap.
      markInboxSent(inbox.id),
    ]);

    return { sent: true, messageId: result.messageId } as const;
  } catch (error) {
    if (error instanceof Error && /oauth|token|auth/i.test(error.message)) {
      await prisma.emailAccount
        .update({ where: { id: inbox.id }, data: { status: "ERROR" } })
        .catch(() => undefined);
    }
    const responseCode =
      typeof error === "object" && error !== null && "responseCode" in error
        ? Number(error.responseCode)
        : 0;
    const hardBounce = responseCode >= 550 && responseCode <= 559;
    const message =
      error instanceof Error ? error.message : "Unknown send error";
    // Errors we know retries can't fix — config / auth / sender identity —
    // get marked terminal so the contact row stops showing a phantom
    // "Scheduled" time and the worker doesn't waste 3 attempts.
    const fatal =
      /No active sending inbox|missing encrypted|ENCRYPTION_KEY|EAUTH|Authentication rejected|verified sender|verified identity|API key/i.test(
        message,
      );
    await prisma.emailEvent.create({
      data: {
        workspaceId: campaign.workspaceId,
        campaignId: campaign.id,
        contactId: contact.id,
        sequenceId: sequence.id,
        campaignContactId,
        trackingId,
        eventType: hardBounce ? "BOUNCED_HARD" : "FAILED",
        metadata: {
          responseCode,
          message,
          fatal,
        } as Prisma.InputJsonValue,
      },
    });

    if (hardBounce) {
      await prisma.$transaction([
        prisma.contact.update({
          where: { id: contact.id },
          data: { emailStatus: "INVALID" },
        }),
        prisma.campaignContact.update({
          where: { id: campaignContactId },
          data: {
            status: "BOUNCED",
            nextSendAt: null,
            lastEventAt: new Date(),
          },
        }),
      ]);
      return { bounced: true } as const;
    }

    if (fatal) {
      await prisma.campaignContact.update({
        where: { id: campaignContactId },
        data: {
          status: "FAILED",
          nextSendAt: null,
          lastEventAt: new Date(),
        },
      });
      return { failed: true, reason: message } as const;
    }

    throw error;
  }
}

import { Prisma, prisma } from "@marimail/db";
import { Router } from "express";
import { sendData } from "../lib/http.js";
import { createSignedToken } from "@marimail/utils";

export const providerWebhookRouter = Router();

type NormalizedEvent = {
  type:
    | "SENT"
    | "BOUNCED_SOFT"
    | "BOUNCED_HARD"
    | "FAILED"
    | "SPAM"
    | "OPENED"
    | "CLICKED"
    | "UNSUBSCRIBED";
  messageId?: string;
  trackingId?: string;
  email?: string;
  metadata: Prisma.InputJsonValue;
};

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function eventName(body: Record<string, unknown>, provider: string) {
  if (provider === "ses" && typeof body.Message === "string") {
    try {
      const message = JSON.parse(body.Message) as Record<string, unknown>;
      return String(
        message.notificationType ?? message.eventType ?? "",
      ).toLowerCase();
    } catch {
      return "";
    }
  }
  return String(
    body.event ??
      body.Event ??
      body.event_type ??
      body.eventType ??
      body.RecordType ??
      body.Type ??
      "",
  ).toLowerCase();
}

function trackingIdFromMetadata(body: Record<string, unknown>) {
  const metadata = body["user-variables"] ?? body.metadata ?? body.Metadata;
  if (metadata && typeof metadata === "object") {
    const entry = metadata as Record<string, unknown>;
    return firstString(
      entry.trackingId,
      entry.tracking_id,
      entry["X-Tracking-Id"],
    );
  }
  return firstString(
    body.trackingId,
    body.tracking_id,
    body["X-Tracking-Id"],
    body.tag,
  );
}

function classifyEvent(name: string): NormalizedEvent["type"] {
  if (/open/.test(name)) return "OPENED";
  if (/click/.test(name)) return "CLICKED";
  if (/complaint|spam/.test(name)) return "SPAM";
  if (/unsubscribe/.test(name)) return "UNSUBSCRIBED";
  if (/bounce|bounced|permanent_fail|failed/.test(name)) {
    return /soft|temporary|transient/.test(name)
      ? "BOUNCED_SOFT"
      : "BOUNCED_HARD";
  }
  if (/reject|drop|defer|error/.test(name)) return "FAILED";
  return "SENT";
}

function normalize(provider: string, body: unknown): NormalizedEvent[] {
  const entries = Array.isArray(body) ? body : [body];
  return entries
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === "object"),
    )
    .map((item) => {
      let payload = item;
      if (provider === "ses" && typeof item.Message === "string") {
        try {
          payload = JSON.parse(item.Message) as Record<string, unknown>;
        } catch {
          payload = item;
        }
      }
      const name = eventName(item, provider) || eventName(payload, provider);
      const messageId = firstString(
        payload.messageId,
        payload.message_id,
        payload.MessageID,
        payload.sg_message_id,
        payload["message-id"],
        payload.mail && typeof payload.mail === "object"
          ? (payload.mail as Record<string, unknown>).messageId
          : undefined,
      );
      const email = firstString(
        payload.email,
        payload.recipient,
        payload.Recipient,
        payload.rcpt,
        payload.address,
      );
      return {
        type: classifyEvent(name),
        messageId,
        trackingId:
          trackingIdFromMetadata(payload) ?? trackingIdFromMetadata(item),
        email,
        metadata: { provider, payload } as Prisma.InputJsonValue,
      };
    });
}

async function findSentEvent(event: NormalizedEvent) {
  if (event.trackingId) {
    const byTracking = await prisma.emailEvent.findFirst({
      where: { trackingId: event.trackingId, eventType: "SENT" },
      orderBy: { occurredAt: "desc" },
    });
    if (byTracking) return byTracking;
  }
  if (event.messageId) {
    return prisma.emailEvent.findFirst({
      where: { messageId: event.messageId, eventType: "SENT" },
      orderBy: { occurredAt: "desc" },
    });
  }
  return null;
}

async function applySuppression(
  sent: Awaited<ReturnType<typeof findSentEvent>>,
  reason: string,
) {
  if (!sent) return;
  const contact = await prisma.contact.findUnique({
    where: { id: sent.contactId },
    select: { email: true },
  });
  if (!contact?.email) return;
  const token = createSignedToken({
    workspaceId: sent.workspaceId,
    email: contact.email.toLowerCase(),
  });
  await prisma.globalSuppression.upsert({
    where: {
      email_workspaceId: {
        email: contact.email.toLowerCase(),
        workspaceId: sent.workspaceId,
      },
    },
    update: { reason },
    create: {
      workspaceId: sent.workspaceId,
      email: contact.email.toLowerCase(),
      reason,
      token,
    },
  });
}

async function recordProviderEvent(event: NormalizedEvent) {
  const sent = await findSentEvent(event);
  if (!sent) return { skipped: true };
  const created = await prisma.emailEvent.create({
    data: {
      workspaceId: sent.workspaceId,
      campaignId: sent.campaignId,
      contactId: sent.contactId,
      sequenceId: sent.sequenceId,
      campaignContactId: sent.campaignContactId,
      messageId: event.messageId,
      trackingId: event.trackingId ?? sent.trackingId,
      eventType: event.type,
      metadata: event.metadata,
    },
  });

  if (["BOUNCED_HARD", "SPAM", "UNSUBSCRIBED"].includes(event.type)) {
    await prisma.campaignContact.updateMany({
      where: { id: sent.campaignContactId ?? "" },
      data: {
        status:
          event.type === "UNSUBSCRIBED"
            ? "UNSUBSCRIBED"
            : event.type === "SPAM"
              ? "FAILED"
              : "BOUNCED",
        nextSendAt: null,
        lastEventAt: new Date(),
      },
    });
    if (event.type === "BOUNCED_HARD") {
      await prisma.contact.update({
        where: { id: sent.contactId },
        data: { emailStatus: "INVALID" },
      });
    }
    await applySuppression(sent, event.type.toLowerCase());
  }
  return { skipped: false, event: created };
}

for (const provider of ["resend", "sendgrid", "postmark", "ses", "mailgun"]) {
  providerWebhookRouter.post(`/${provider}`, async (req, res) => {
    const events = normalize(provider, req.body);
    const results = [];
    for (const event of events) {
      results.push(await recordProviderEvent(event));
    }
    return sendData(res, {
      received: events.length,
      recorded: results.filter((item) => !item.skipped).length,
    });
  });
}

import { Prisma, prisma } from "@marimail/db";
import { verifySignedToken } from "@marimail/utils";
import { Router } from "express";
import { z } from "zod";
import { sendData, sendError } from "../lib/http.js";

export const trackingRouter = Router();
export const inboundRouter = Router();
export const unsubscribeRouter = Router();

const onePixelGif = Buffer.from(
  "R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
  "base64",
);

async function eventFromTrackingId(trackingId: string) {
  return prisma.emailEvent.findFirst({
    where: { trackingId, eventType: "SENT" },
    orderBy: { occurredAt: "desc" },
    include: { campaign: true, contact: true, campaignContact: true },
  });
}

async function recordFollowupEvent(trackingId: string, eventType: "OPENED" | "CLICKED" | "REPLIED", metadata: Prisma.InputJsonValue) {
  const sent = await eventFromTrackingId(trackingId);
  if (!sent) return null;

  const event = await prisma.emailEvent.create({
    data: {
      workspaceId: sent.workspaceId,
      campaignId: sent.campaignId,
      contactId: sent.contactId,
      sequenceId: sent.sequenceId,
      campaignContactId: sent.campaignContactId,
      trackingId,
      eventType,
      metadata,
    },
  });

  if (sent.campaignContactId) {
    await prisma.campaignContact.update({
      where: { id: sent.campaignContactId },
      data: {
        status: eventType,
        lastEventAt: new Date(),
        nextSendAt: eventType === "REPLIED" ? null : undefined,
      },
    });
  }

  return event;
}

trackingRouter.get("/o/:trackingId", async (req, res) => {
  await recordFollowupEvent(req.params.trackingId, "OPENED", {
    userAgent: req.header("user-agent") ?? null,
    ip: req.ip,
  } as Prisma.InputJsonValue);

  res.setHeader("Content-Type", "image/gif");
  res.setHeader("Cache-Control", "no-store");
  return res.end(onePixelGif);
});

trackingRouter.get("/c/:trackingId", async (req, res) => {
  const url = typeof req.query.url === "string" ? req.query.url : null;
  await recordFollowupEvent(req.params.trackingId, "CLICKED", {
    url,
    userAgent: req.header("user-agent") ?? null,
    ip: req.ip,
  } as Prisma.InputJsonValue);

  if (!url || !/^https?:\/\//i.test(url)) {
    return res.redirect("/");
  }
  return res.redirect(url);
});

const replySchema = z.object({
  trackingId: z.string().optional(),
  to: z.string().optional(),
  from: z.string().email().optional(),
  subject: z.string().optional(),
  text: z.string().optional(),
});

function trackingFromReplyAddress(to: string | undefined) {
  const match = to?.match(/reply\+([^@\s]+)@/i);
  return match?.[1] ?? null;
}

inboundRouter.post("/reply", async (req, res) => {
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const trackingId = parsed.data.trackingId ?? trackingFromReplyAddress(parsed.data.to);
  if (!trackingId) return sendError(res, 400, "TRACKING_ID_REQUIRED", "Reply tracking id is required");

  const event = await recordFollowupEvent(trackingId, "REPLIED", {
    from: parsed.data.from,
    subject: parsed.data.subject,
    text: parsed.data.text,
  } as Prisma.InputJsonValue);
  if (!event) return sendError(res, 404, "NOT_FOUND", "Tracking id not found");
  return sendData(res, { event });
});

const bounceSchema = z.object({
  trackingId: z.string(),
  smtpCode: z.number().int().optional(),
  response: z.string().optional(),
});

inboundRouter.post("/bounce", async (req, res) => {
  const parsed = bounceSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const sent = await eventFromTrackingId(parsed.data.trackingId);
  if (!sent) return sendError(res, 404, "NOT_FOUND", "Tracking id not found");

  const hard = parsed.data.smtpCode ? parsed.data.smtpCode >= 550 && parsed.data.smtpCode <= 559 : false;
  const event = await prisma.emailEvent.create({
    data: {
      workspaceId: sent.workspaceId,
      campaignId: sent.campaignId,
      contactId: sent.contactId,
      sequenceId: sent.sequenceId,
      campaignContactId: sent.campaignContactId,
      trackingId: parsed.data.trackingId,
      eventType: hard ? "BOUNCED_HARD" : "BOUNCED_SOFT",
      metadata: parsed.data as Prisma.InputJsonValue,
    },
  });

  await prisma.campaignContact.updateMany({
    where: { id: sent.campaignContactId ?? "" },
    data: { status: "BOUNCED", lastEventAt: new Date(), nextSendAt: null },
  });
  if (hard) {
    await prisma.contact.update({ where: { id: sent.contactId }, data: { emailStatus: "INVALID" } });
  }

  return sendData(res, { event });
});

unsubscribeRouter.post("/:token", async (req, res) => {
  const payload = verifySignedToken<{ workspaceId: string; email: string }>(req.params.token);
  if (!payload?.email) return sendError(res, 400, "INVALID_TOKEN", "Unsubscribe token is invalid");

  const suppression = await prisma.globalSuppression.upsert({
    where: { email_workspaceId: { email: payload.email.toLowerCase(), workspaceId: payload.workspaceId ?? null } },
    update: { reason: "unsubscribe" },
    create: {
      workspaceId: payload.workspaceId ?? null,
      email: payload.email.toLowerCase(),
      token: req.params.token,
      reason: "unsubscribe",
    },
  });

  const contacts = await prisma.contact.findMany({
    where: { email: payload.email.toLowerCase(), workspaceId: payload.workspaceId ?? undefined },
    select: { id: true },
  });

  await prisma.campaignContact.updateMany({
    where: { contactId: { in: contacts.map((contact) => contact.id) }, status: { in: ["PENDING", "SCHEDULED", "SENT", "OPENED", "CLICKED"] } },
    data: { status: "UNSUBSCRIBED", nextSendAt: null, lastEventAt: new Date() },
  });

  return sendData(res, { suppression });
});

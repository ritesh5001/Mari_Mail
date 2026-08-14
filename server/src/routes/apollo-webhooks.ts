import { Router } from "express";
import { prisma } from "@marimail/db";
import { sendData, sendError } from "../lib/http.js";
import { verifyPhoneWebhookToken } from "../services/apollo/phone-webhook.js";
import { grantCredits } from "../services/billing.service.js";

/**
 * Apollo's phone-number callback.
 *
 * Public by necessity — Apollo calls it — so it authenticates with a per-person
 * HMAC token issued when the reveal was requested. A leaked URL is therefore
 * only good for the one person it was minted for, and cannot be replayed to
 * inject numbers for anyone else.
 *
 * Always answers 200 to a well-formed call, even when there is nothing to do.
 * Apollo retries on non-2xx, and retrying a delivery we have already applied
 * (or one we have no pending request for) achieves nothing but noise.
 */
export const apolloWebhookRouter = Router();

/** Digs the first usable number out of whichever shape Apollo sends. */
function extractPhone(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const person = (record.person ?? record.contact ?? record) as Record<string, unknown>;

  const direct = person.phone_number ?? person.sanitized_phone ?? record.phone_number;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const numbers = (person.phone_numbers ?? record.phone_numbers) as unknown;
  if (Array.isArray(numbers)) {
    for (const entry of numbers) {
      if (typeof entry === "string" && entry.trim()) return entry.trim();
      if (entry && typeof entry === "object") {
        const row = entry as Record<string, unknown>;
        const value = row.sanitized_number ?? row.raw_number ?? row.number;
        if (typeof value === "string" && value.trim()) return value.trim();
      }
    }
  }
  return null;
}

apolloWebhookRouter.post("/phone-webhook", async (req, res, next) => {
  try {
    const apolloId = typeof req.query.id === "string" ? req.query.id : "";
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!apolloId || !(await verifyPhoneWebhookToken(apolloId, token))) {
      return sendError(res, 401, "INVALID_TOKEN", "Invalid webhook token");
    }

    const phone = extractPhone(req.body);
    const pending = await prisma.apolloPhoneRequest.findMany({
      where: { apolloId, status: "PENDING" },
    });

    if (!phone) {
      // Apollo looked and found nothing. The customer paid for a lookup that
      // returned no number, so the credits go back.
      for (const request of pending) {
        if (request.creditsCharged > 0) {
          await grantCredits(
            request.workspaceId,
            request.creditsCharged,
            "REFUND",
            `apollo:${apolloId}:phone:no-data`,
            request.userId,
          ).catch(() => undefined);
        }
      }
      await prisma.apolloPhoneRequest.updateMany({
        where: { apolloId, status: "PENDING" },
        data: { status: "FAILED", failureReason: "Apollo returned no phone number", settledAt: new Date() },
      });
      return sendData(res, { received: true, phone: false });
    }

    // The platform-wide cache is keyed by Apollo person id, so the next
    // workspace to want this number is served from here without paying Apollo
    // again — same rule the email path already follows.
    await prisma.apolloRevealCache
      .update({
        where: { apolloId },
        data: { mobilePhone: phone, phoneRevealedAt: new Date() },
      })
      .catch(() => undefined);

    // Write it onto each waiting workspace's own contact row.
    for (const request of pending) {
      if (request.contactId) {
        await prisma.contact
          .update({ where: { id: request.contactId }, data: { mobilePhone: phone } })
          .catch(() => undefined);
      } else {
        await prisma.contact
          .updateMany({
            where: { workspaceId: request.workspaceId, email: { endsWith: `${apolloId}@unknown.local` } },
            data: { mobilePhone: phone },
          })
          .catch(() => undefined);
      }
    }

    await prisma.apolloPhoneRequest.updateMany({
      where: { apolloId, status: "PENDING" },
      data: { status: "DELIVERED", phone, settledAt: new Date() },
    });

    return sendData(res, { received: true, phone: true, applied: pending.length });
  } catch (error) {
    return next(error);
  }
});

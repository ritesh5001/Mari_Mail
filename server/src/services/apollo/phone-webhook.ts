import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@marimail/db";
import { grantCredits } from "../billing.service.js";

/**
 * Where Apollo delivers revealed phone numbers.
 *
 * Apollo's phone reveal is asynchronous: `people/match` with
 * `reveal_phone_number: true` returns a person WITHOUT the number and posts it
 * to `webhook_url` when it has one — which is why omitting the parameter fails
 * with "Please add a valid 'webhook_url' parameter".
 *
 * The URL has to be reachable from the public internet, so it cannot be
 * derived from the server's own listen address. It comes from configuration,
 * with a sensible default built from APP_URL, since the web app already proxies
 * `/backend/*` through to this API.
 *
 * When it is NOT configured, phone reveals are refused BEFORE any credit is
 * spent. That is the whole point of having this as a pre-flight check: the
 * alternative — charging 20 credits, calling Apollo, getting a 400 and relying
 * on the refund path — bills the customer for a request that never had a chance
 * of working.
 */

const PATH = "/api/apollo/phone-webhook";

function baseUrl(): string | null {
  const explicit = process.env.APOLLO_WEBHOOK_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const app = process.env.APP_URL?.trim();
  // The Next app rewrites /backend/* to this API (see client/next.config), so
  // this is the API's public address in a standard deployment.
  if (app && !app.includes("localhost") && !app.includes("127.0.0.1")) {
    return `${app.replace(/\/$/, "")}/backend`;
  }
  return null;
}

function secret(): string | null {
  return process.env.APOLLO_WEBHOOK_SECRET?.trim() || null;
}

/**
 * A per-person token, so a leaked URL for one reveal can't be replayed to
 * forge results for others. HMAC rather than a bare shared secret for the same
 * reason.
 */
export function phoneWebhookToken(apolloId: string): string | null {
  const key = secret();
  if (!key) return null;
  return createHmac("sha256", key).update(apolloId).digest("hex").slice(0, 32);
}

export function verifyPhoneWebhookToken(apolloId: string, token: string): boolean {
  const expected = phoneWebhookToken(apolloId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  // Length check first: timingSafeEqual throws on a length mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

export type PhoneWebhookConfig = { configured: true; url: string } | { configured: false; reason: string };

export function phoneWebhookFor(apolloId: string): PhoneWebhookConfig {
  const base = baseUrl();
  if (!base) {
    return {
      configured: false,
      reason:
        "Phone reveal needs a public webhook URL. Set APOLLO_WEBHOOK_BASE_URL (or APP_URL to a public address) and restart the API.",
    };
  }
  const token = phoneWebhookToken(apolloId);
  if (!token) {
    return {
      configured: false,
      reason: "Phone reveal needs APOLLO_WEBHOOK_SECRET to be set so Apollo's callback can be authenticated.",
    };
  }
  return { configured: true, url: `${base}${PATH}?id=${encodeURIComponent(apolloId)}&token=${token}` };
}

/** How long a pending reveal waits before it is written off and refunded. */
export const PHONE_REVEAL_TIMEOUT_MINUTES = 30;

/**
 * Refunds phone reveals Apollo never delivered.
 *
 * The customer's credits are taken when the request goes out, because that is
 * when Apollo's quota is spent. If the callback never arrives — Apollo dropped
 * it, the webhook was unreachable for an hour, the number was never found —
 * the charge has bought nothing, and a silent 20-credit hole is exactly the
 * kind of billing detail that destroys trust in a credit system.
 *
 * Idempotent: the status transition is a conditional update, so a request
 * refunded on one run is not seen by the next.
 */
export async function refundStalePhoneReveals(): Promise<{ refunded: number; credits: number }> {
  const cutoff = new Date(Date.now() - PHONE_REVEAL_TIMEOUT_MINUTES * 60 * 1000);
  const stale = await prisma.apolloPhoneRequest.findMany({
    where: { status: "PENDING", requestedAt: { lt: cutoff } },
    take: 500,
  });

  let refunded = 0;
  let credits = 0;
  for (const request of stale) {
    // Claim it first; only the winner refunds.
    const claimed = await prisma.apolloPhoneRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: "FAILED",
        failureReason: `No callback from Apollo within ${PHONE_REVEAL_TIMEOUT_MINUTES} minutes`,
        settledAt: new Date(),
      },
    });
    if (claimed.count === 0) continue;

    if (request.creditsCharged > 0) {
      await grantCredits(
        request.workspaceId,
        request.creditsCharged,
        "REFUND",
        `apollo:${request.apolloId}:phone:undelivered`,
        request.userId,
      ).catch((error) => {
        console.error("[apollo] phone refund failed:", error);
      });
      credits += request.creditsCharged;
    }
    refunded += 1;
  }

  return { refunded, credits };
}

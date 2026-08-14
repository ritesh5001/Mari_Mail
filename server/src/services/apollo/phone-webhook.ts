import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@marimail/db";
import { grantCredits } from "../billing.service.js";
import { decryptJsonSecret } from "../email-account.service.js";
import { getOrCreateApolloSettings } from "./settings.js";

/**
 * Where Apollo delivers revealed phone numbers.
 *
 * Apollo's phone reveal is asynchronous: `people/match` with
 * `reveal_phone_number: true` returns a person WITHOUT the number and posts it
 * to `webhook_url` when it has one — which is why omitting the parameter fails
 * with "Please add a valid 'webhook_url' parameter".
 *
 * Both settings live in the ADMIN PANEL, alongside the Apollo API key, rather
 * than in environment variables: the rest of the integration is already managed
 * there, and needing a redeploy to change a callback URL would make the panel a
 * half-truth. Environment variables are still honoured as a fallback so an
 * existing deployment keeps working, but the database wins when both are set.
 *
 * When neither is configured, phone reveals are refused BEFORE any credit is
 * spent — see the pre-flight check in the reveal route. The alternative,
 * charging 20 credits for a call Apollo is certain to reject, is not something
 * to do to a customer when the failure is knowable in advance.
 */

const PATH = "/api/apollo/phone-webhook";

type WebhookConfigValues = { baseUrl: string | null; secret: string | null };

async function loadConfig(): Promise<WebhookConfigValues> {
  let baseUrl: string | null = null;
  let secret: string | null = null;

  try {
    const settings = await getOrCreateApolloSettings();
    baseUrl = settings.webhookBaseUrl?.trim() || null;
    const stored = decryptJsonSecret<{ secret?: string }>(settings.webhookSecret);
    secret = stored?.secret?.trim() || null;
  } catch (error) {
    // A settings read failing must not take phone reveal down silently — fall
    // through to the environment and let the caller report what's missing.
    console.error("[apollo] could not read webhook settings:", error);
  }

  if (!baseUrl) {
    const explicit = process.env.APOLLO_WEBHOOK_BASE_URL?.trim();
    if (explicit) {
      baseUrl = explicit;
    } else {
      // The Next app rewrites /backend/* to this API (see client/next.config),
      // so this is the API's public address in a standard deployment.
      const app = process.env.APP_URL?.trim();
      if (app && !app.includes("localhost") && !app.includes("127.0.0.1")) {
        baseUrl = `${app.replace(/\/$/, "")}/backend`;
      }
    }
  }
  if (!secret) secret = process.env.APOLLO_WEBHOOK_SECRET?.trim() || null;

  return { baseUrl: baseUrl ? baseUrl.replace(/\/$/, "") : null, secret };
}

/**
 * A per-person token, so a leaked URL for one reveal can't be replayed to
 * forge results for others. HMAC rather than a bare shared secret for the same
 * reason.
 */
export function signWebhookToken(secret: string, apolloId: string): string {
  return createHmac("sha256", secret).update(apolloId).digest("hex").slice(0, 32);
}

export async function verifyPhoneWebhookToken(apolloId: string, token: string): Promise<boolean> {
  const { secret } = await loadConfig();
  if (!secret || !token) return false;
  const expected = Buffer.from(signWebhookToken(secret, apolloId));
  const received = Buffer.from(token);
  // Length check first: timingSafeEqual throws on a length mismatch.
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export type PhoneWebhookConfig =
  | { configured: true; url: string }
  | { configured: false; reason: string };

export async function phoneWebhookFor(apolloId: string): Promise<PhoneWebhookConfig> {
  const { baseUrl, secret } = await loadConfig();
  if (!baseUrl) {
    return {
      configured: false,
      reason:
        "An admin needs to set the phone-reveal callback URL under Contact Data Source in the admin panel.",
    };
  }
  if (!secret) {
    return {
      configured: false,
      reason:
        "An admin needs to set the phone-reveal callback secret under Contact Data Source in the admin panel.",
    };
  }
  return {
    configured: true,
    url: `${baseUrl}${PATH}?id=${encodeURIComponent(apolloId)}&token=${signWebhookToken(secret, apolloId)}`,
  };
}

/** Whether phone reveal can run at all — used by the admin panel's status row. */
export async function phoneWebhookStatus(): Promise<{
  configured: boolean;
  baseUrl: string | null;
  hasSecret: boolean;
  callbackUrl: string | null;
}> {
  const { baseUrl, secret } = await loadConfig();
  return {
    configured: Boolean(baseUrl && secret),
    baseUrl,
    hasSecret: Boolean(secret),
    // The path Apollo will call, without a token — enough for an admin to
    // confirm it points somewhere reachable, without leaking a usable one.
    callbackUrl: baseUrl ? `${baseUrl}${PATH}` : null,
  };
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

import crypto from "node:crypto";

/**
 * Razorpay gateway client.
 *
 * Talks to the REST API directly rather than pulling in the `razorpay` SDK:
 * the only calls needed are "create an order" and "fetch a payment", and the
 * parts that actually matter for correctness are the two signature checks
 * below. Those are 20 lines of HMAC that I would rather have in the repo,
 * readable and unit-tested, than delegated to a dependency.
 *
 * Currency is USD. Razorpay settles in INR, so the account must have
 * International Payments enabled or order creation is rejected with
 * `international_transaction_not_allowed`.
 */

const RAZORPAY_API = "https://api.razorpay.com/v1";

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string | null;
};

/**
 * Reads config from env. Returns null when unconfigured, which every caller
 * treats as "Razorpay is not available here" rather than crashing — the app
 * must still boot in a dev or CI environment with no gateway keys.
 */
export function razorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return {
    keyId,
    keySecret,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null,
  };
}

export function isRazorpayConfigured(): boolean {
  return razorpayConfig() !== null;
}

export class RazorpayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "RazorpayError";
  }
}

async function razorpayFetch<T>(
  config: RazorpayConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");
  // Razorpay can be slow under load and Node's fetch has no default timeout —
  // without this an unresponsive gateway would hold an Express worker open
  // indefinitely.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  let response: Response;
  try {
    response = await fetch(`${RAZORPAY_API}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch (error) {
    const aborted = (error as Error).name === "AbortError";
    throw new RazorpayError(
      aborted ? "Razorpay did not respond in time." : "Could not reach Razorpay.",
      503,
    );
  } finally {
    clearTimeout(timeout);
  }

  const body = (await response.json().catch(() => null)) as
    | { error?: { description?: string; code?: string } }
    | null;

  if (!response.ok) {
    throw new RazorpayError(
      body?.error?.description ?? `Razorpay request failed (${response.status})`,
      response.status,
      body?.error?.code,
    );
  }
  return body as T;
}

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
};

/**
 * Creates an order. `amountCents` is the integer minor unit — Razorpay's
 * `amount` field is already in the smallest unit, so no conversion is applied
 * and none should be.
 *
 * `notes` are echoed back on the webhook payload, which is how a webhook
 * arriving with no browser session still knows which workspace to credit.
 */
export async function createRazorpayOrder(input: {
  amountCents: number;
  currency?: string;
  receipt: string;
  notes: Record<string, string>;
}): Promise<RazorpayOrder> {
  const config = razorpayConfig();
  if (!config) throw new RazorpayError("Razorpay is not configured.", 503);

  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new RazorpayError("Order amount must be a positive integer.", 400);
  }

  return razorpayFetch<RazorpayOrder>(config, "/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountCents,
      currency: input.currency ?? "USD",
      // Razorpay caps receipts at 40 characters and rejects longer ones.
      receipt: input.receipt.slice(0, 40),
      notes: input.notes,
      // Capture immediately. With `payment_capture: 0` the money is only
      // authorised and silently auto-refunds after a few days — the customer
      // sees a charge, we see nothing, and the plan never activates.
      payment_capture: 1,
    }),
  });
}

export type RazorpayPayment = {
  id: string;
  order_id: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  amount: number;
  currency: string;
  method?: string;
  error_description?: string;
  notes?: Record<string, string>;
};

export async function fetchRazorpayPayment(paymentId: string): Promise<RazorpayPayment> {
  const config = razorpayConfig();
  if (!config) throw new RazorpayError("Razorpay is not configured.", 503);
  return razorpayFetch<RazorpayPayment>(config, `/payments/${encodeURIComponent(paymentId)}`);
}

/**
 * Constant-time comparison of two hex digests.
 *
 * `timingSafeEqual` throws when the buffers differ in length, so the length is
 * checked first — but that check leaks only the length of an attacker-supplied
 * signature, which is public knowledge (it is always a SHA-256 hex digest).
 */
function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length === 0 || bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the signature Razorpay Checkout hands back to the browser.
 *
 * The browser is not trusted: without this check anyone could POST an arbitrary
 * order id to the verify endpoint and self-provision a paid plan. The signature
 * is HMAC-SHA256 of `order_id|payment_id`, keyed with the account's key SECRET
 * — which never leaves the server, so it cannot be forged client-side.
 *
 * This is defence in depth, not the source of truth. The webhook is
 * authoritative because it arrives even if the customer closes the tab.
 */
export function verifyPaymentSignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const config = razorpayConfig();
  if (!config) return false;
  const expected = crypto
    .createHmac("sha256", config.keySecret)
    .update(`${input.orderId}|${input.paymentId}`)
    .digest("hex");
  return safeEqualHex(expected, input.signature);
}

/**
 * Verifies a webhook delivery.
 *
 * HMAC-SHA256 of the RAW request body, keyed with the webhook secret (a
 * different secret from the API key). The body must be the exact bytes
 * received: parsing and re-serialising JSON reorders keys and changes
 * whitespace, and the digest then never matches. The route mounts
 * `express.raw()` for exactly this reason.
 *
 * Fails closed. An unconfigured webhook secret means every delivery is
 * rejected, because an unverified webhook is an open endpoint that grants paid
 * plans to anyone who can POST to it.
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const config = razorpayConfig();
  if (!config?.webhookSecret || !signature) return false;
  const expected = crypto
    .createHmac("sha256", config.webhookSecret)
    .update(rawBody)
    .digest("hex");
  return safeEqualHex(expected, signature);
}

/** The publishable key id, safe to hand to the browser. */
export function razorpayPublicKey(): string | null {
  return razorpayConfig()?.keyId ?? null;
}

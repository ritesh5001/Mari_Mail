import { Router, raw } from "express";
import { z } from "zod";
import { prisma } from "@marimail/db";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
  isRazorpayConfigured,
  razorpayPublicKey,
  RazorpayError,
  verifyPaymentSignature,
  verifyWebhookSignature,
} from "../services/razorpay.service.js";
import {
  createPayment,
  creditPurchase,
  failPayment,
  fulfilPayment,
  planPurchase,
} from "../services/payment.service.js";

export const razorpayRouter = Router();
/**
 * Mounted separately and BEFORE the global JSON body parser, because webhook
 * signatures are computed over the raw bytes. Re-serialising parsed JSON
 * reorders keys and normalises whitespace, and the HMAC then never matches.
 */
export const razorpayWebhookRouter = Router();

/**
 * Config for the browser. Only the publishable key id is exposed — the key
 * secret signs receipts and never leaves the server.
 */
razorpayRouter.get("/config", requireAuth, async (_req, res) => {
  return sendData(res, {
    configured: isRazorpayConfigured(),
    keyId: razorpayPublicKey(),
    currency: "USD",
  });
});

const orderSchema = z
  .object({
    plan: z.enum(["STARTER", "PRO", "BUSINESS"]).optional(),
    creditPack: z.enum(["1000", "5000", "20000"]).optional(),
  })
  .refine((value) => Boolean(value.plan) !== Boolean(value.creditPack), {
    message: "Provide exactly one of plan or creditPack",
  });

/**
 * Opens a checkout.
 *
 * The amount is resolved SERVER-SIDE from the shared catalog and never read
 * from the request. A client-supplied amount is the classic payment bug: post
 * `{ plan: "BUSINESS", amountCents: 1 }` and buy the top tier for a cent.
 *
 * ENTERPRISE is absent from the enum on purpose — it is priced per deal and is
 * provisioned through an admin payment link, not self-serve checkout.
 */
razorpayRouter.post("/order", requireAuth, async (req, res, next) => {
  try {
    if (!isRazorpayConfigured()) {
      return sendError(res, 503, "RAZORPAY_NOT_CONFIGURED", "Online payment is not available right now.");
    }
    const input = orderSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const purchase = input.data.plan
      ? planPurchase(input.data.plan)
      : creditPurchase(input.data.creditPack!);
    if (!purchase) {
      return sendError(res, 400, "VALIDATION_ERROR", "That plan isn't available for self-serve purchase.");
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace) return sendError(res, 404, "NOT_FOUND", "Workspace not found");

    // Our row first, so an order that Razorpay creates but we then fail to
    // record can't exist — the reverse ordering loses the audit trail for any
    // payment that succeeds during a crash.
    const payment = await createPayment({
      workspaceId,
      userId,
      provider: "RAZORPAY",
      amountCents: purchase.amountCents,
      grantPlan: "grantPlan" in purchase ? purchase.grantPlan : null,
      grantCredits: "grantCredits" in purchase ? purchase.grantCredits : null,
      periodDays: "periodDays" in purchase ? purchase.periodDays : null,
    });

    let order;
    try {
      order = await createRazorpayOrder({
        amountCents: purchase.amountCents,
        currency: "USD",
        receipt: payment.id,
        // Echoed back on the webhook. This is how a delivery that arrives with
        // no browser session still knows what to provision.
        notes: {
          paymentId: payment.id,
          workspaceId,
          ...(input.data.plan ? { plan: input.data.plan } : {}),
          ...(input.data.creditPack ? { creditPack: input.data.creditPack } : {}),
        },
      });
    } catch (error) {
      await failPayment(
        { id: payment.id },
        error instanceof RazorpayError ? error.message : "Could not create the order",
      );
      if (error instanceof RazorpayError) {
        // `international_transaction_not_allowed` is the one operators hit
        // first: USD orders are rejected until International Payments is
        // switched on in the Razorpay dashboard. Say so rather than surfacing
        // a bare gateway string.
        const message =
          error.code === "international_transaction_not_allowed"
            ? "This Razorpay account can't take USD payments yet. Enable International Payments in the Razorpay dashboard."
            : error.message;
        return sendError(res, error.status >= 500 ? 502 : 400, "RAZORPAY_ERROR", message);
      }
      throw error;
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: { razorpayOrderId: order.id },
    });

    return sendData(res, {
      paymentId: payment.id,
      orderId: order.id,
      amountCents: purchase.amountCents,
      currency: "USD",
      keyId: razorpayPublicKey(),
      description: purchase.label,
      workspaceName: workspace.name,
    });
  } catch (error) {
    return next(error);
  }
});

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

/**
 * The browser's post-checkout callback.
 *
 * Exists so a customer sees their plan activate immediately instead of waiting
 * on webhook delivery. It is NOT the source of truth — the webhook is, because
 * it arrives whether or not the tab survives.
 *
 * The signature check is what makes this safe to expose: without it, any
 * authenticated user could POST an order id and self-provision. The HMAC is
 * keyed with the account secret, so a valid one can only have come from
 * Razorpay.
 */
razorpayRouter.post("/verify", requireAuth, async (req, res, next) => {
  try {
    const input = verifySchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", "Invalid payment confirmation");
    }
    const { workspaceId } = (req as AuthedRequest).auth;
    const {
      razorpay_order_id: orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: signature,
    } = input.data;

    if (!verifyPaymentSignature({ orderId, paymentId, signature })) {
      console.warn(`[razorpay] rejected a bad payment signature for order ${orderId}`);
      return sendError(res, 400, "INVALID_SIGNATURE", "We couldn't verify that payment.");
    }

    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: orderId } });
    if (!payment) return sendError(res, 404, "NOT_FOUND", "Payment not found");
    // A valid signature proves Razorpay issued the receipt — it does not prove
    // the caller owns the workspace being credited.
    if (payment.workspaceId !== workspaceId) {
      return sendError(res, 404, "NOT_FOUND", "Payment not found");
    }

    const result = await fulfilPayment({ razorpayOrderId: orderId }, { razorpayPaymentId: paymentId });
    if (result.status === "not-found") {
      return sendError(res, 404, "NOT_FOUND", "Payment not found");
    }
    return sendData(res, { status: result.status, paymentId: result.payment.id });
  } catch (error) {
    return next(error);
  }
});

/** Recent payments for the billing page's history table. */
razorpayRouter.get("/payments", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const payments = await prisma.payment.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        provider: true,
        status: true,
        purpose: true,
        amountCents: true,
        currency: true,
        grantPlan: true,
        grantCredits: true,
        failureReason: true,
        paidAt: true,
        createdAt: true,
      },
    });
    return sendData(res, { payments });
  } catch (error) {
    return next(error);
  }
});

/**
 * Razorpay webhook — the authoritative fulfilment path.
 *
 * Answers 200 for anything it has understood, including duplicates, because a
 * non-2xx makes Razorpay retry for hours. It only returns a non-2xx when the
 * signature is bad (which should never legitimately happen) or when processing
 * genuinely failed and a retry might succeed.
 */
razorpayWebhookRouter.post(
  "/webhook",
  raw({ type: "application/json" }),
  async (req, res, next) => {
    try {
      const signature = req.header("x-razorpay-signature");
      const rawBody = req.body as Buffer;

      // Fails closed when RAZORPAY_WEBHOOK_SECRET is unset: an unverified
      // webhook endpoint hands paid plans to anyone who can POST to it.
      if (!Buffer.isBuffer(rawBody) || !verifyWebhookSignature(rawBody, signature)) {
        console.warn("[razorpay] rejected a webhook with an invalid signature");
        return sendError(res, 400, "INVALID_SIGNATURE", "Invalid webhook signature");
      }

      const event = JSON.parse(rawBody.toString("utf8")) as {
        event: string;
        payload?: {
          payment?: {
            entity?: {
              id?: string;
              order_id?: string;
              error_description?: string;
              notes?: Record<string, string>;
            };
          };
        };
      };

      const entity = event.payload?.payment?.entity;
      const orderId = entity?.order_id;
      const workspaceId = entity?.notes?.workspaceId ?? null;

      // Razorpay does not send a delivery id, so the payment id plus the event
      // name is the idempotency key. `payment.captured` and `payment.failed`
      // for the same payment are distinct events and must not collide.
      const providerEventId = `${event.event}:${entity?.id ?? orderId ?? "unknown"}`;

      if (workspaceId) {
        const seen = await prisma.billingEvent.findUnique({
          where: {
            provider_providerEventId: { provider: "RAZORPAY", providerEventId },
          },
        });
        if (seen) return res.json({ ok: true, duplicate: true });

        await prisma.billingEvent
          .create({
            data: {
              workspaceId,
              provider: "RAZORPAY",
              providerEventId,
              eventType: event.event,
              payload: (entity ?? {}) as object,
            },
          })
          // A racing duplicate delivery loses the unique-index race. Not an
          // error — fulfilment below is idempotent anyway.
          .catch(() => undefined);
      }

      switch (event.event) {
        case "payment.captured":
        case "order.paid": {
          if (orderId) {
            await fulfilPayment({ razorpayOrderId: orderId }, { razorpayPaymentId: entity?.id });
          }
          break;
        }
        case "payment.failed": {
          if (orderId) {
            await failPayment(
              { razorpayOrderId: orderId },
              entity?.error_description ?? "The payment was declined.",
            );
          }
          break;
        }
        default:
          // Everything else is acknowledged and ignored, so Razorpay stops
          // retrying events this integration has no opinion about.
          break;
      }

      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  },
);

/**
 * Reconciles a payment straight from the gateway.
 *
 * The safety net for the case where the customer closed the tab AND the webhook
 * never arrived (misconfigured secret, firewall, downtime). Asks Razorpay what
 * actually happened rather than trusting anything the client says.
 */
razorpayRouter.post("/reconcile", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const pending = await prisma.payment.findMany({
      where: { workspaceId, provider: "RAZORPAY", status: "CREATED", razorpayOrderId: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    let provisioned = 0;
    for (const payment of pending) {
      if (!payment.razorpayPaymentId) continue;
      try {
        const remote = await fetchRazorpayPayment(payment.razorpayPaymentId);
        if (remote.status === "captured") {
          const result = await fulfilPayment({ id: payment.id }, { razorpayPaymentId: remote.id });
          if (result.status === "provisioned") provisioned += 1;
        } else if (remote.status === "failed") {
          await failPayment({ id: payment.id }, remote.error_description ?? "The payment failed.");
        }
      } catch {
        // One unreadable payment must not abort the sweep.
      }
    }

    return sendData(res, { checked: pending.length, provisioned });
  } catch (error) {
    return next(error);
  }
});

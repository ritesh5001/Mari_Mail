import { prisma, type BillingPlan, type PaymentProvider, type Payment } from "@marimail/db";
import { BILLING_PERIOD_DAYS, PLANS, creditPack } from "@marimail/utils/plans";
import { activateMembership } from "./membership.service.js";
import { grantCredits } from "./billing.service.js";

/**
 * Creating and fulfilling payments, for every gateway.
 *
 * The important property here is that fulfilment is IDEMPOTENT. Two things race
 * to provision every successful payment:
 *
 *   1. the browser, redirected back from checkout with a signed receipt, and
 *   2. the gateway's webhook, which arrives regardless and is retried for hours
 *      until it gets a 2xx.
 *
 * Both are legitimate. The browser callback is fast (the customer sees their
 * plan immediately) but unreliable — people close the tab. The webhook is
 * reliable but can lag, and gateways deliberately send duplicates. Without a
 * single-winner guard, a customer who paid $25 once would get two months of
 * access, twice the credits, or both.
 *
 * The guard is a conditional UPDATE: only the transition CREATED -> PAID
 * provisions anything, and Postgres serialises the two writers so exactly one
 * sees `count === 1`.
 */

export type CreatePaymentInput = {
  workspaceId: string;
  userId?: string | null;
  provider: PaymentProvider;
  amountCents: number;
  currency?: string;
  grantPlan?: BillingPlan | null;
  grantCredits?: number | null;
  periodDays?: number | null;
  paymentLinkId?: string | null;
  razorpayOrderId?: string | null;
  stripeSessionId?: string | null;
};

/**
 * Records an intent to charge, BEFORE the customer reaches the gateway.
 *
 * The amount and the grants are snapshotted here and never recomputed at
 * fulfilment. If the catalog price changes between checkout and the webhook
 * landing, the customer is provisioned exactly what they agreed to pay for —
 * re-deriving from the catalog would silently rewrite the terms of a completed
 * transaction.
 */
export async function createPayment(input: CreatePaymentInput) {
  return prisma.payment.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      provider: input.provider,
      purpose: input.paymentLinkId ? "PAYMENT_LINK" : input.grantPlan ? "PLAN" : "CREDITS",
      amountCents: input.amountCents,
      currency: input.currency ?? "USD",
      grantPlan: input.grantPlan ?? null,
      grantCredits: input.grantCredits ?? null,
      periodDays: input.periodDays ?? null,
      paymentLinkId: input.paymentLinkId ?? null,
      razorpayOrderId: input.razorpayOrderId ?? null,
      stripeSessionId: input.stripeSessionId ?? null,
    },
  });
}

export type FulfilResult =
  | { status: "provisioned"; payment: Payment }
  | { status: "already-provisioned"; payment: Payment }
  | { status: "not-found" };

/**
 * Provisions a successful payment, exactly once.
 *
 * Safe to call any number of times, from any number of concurrent callers, with
 * either the gateway payment id or our own row id.
 */
export async function fulfilPayment(
  where: { id?: string; razorpayOrderId?: string; stripeSessionId?: string },
  meta: { razorpayPaymentId?: string } = {},
): Promise<FulfilResult> {
  const selector = where.id
    ? { id: where.id }
    : where.razorpayOrderId
      ? { razorpayOrderId: where.razorpayOrderId }
      : where.stripeSessionId
        ? { stripeSessionId: where.stripeSessionId }
        : null;
  if (!selector) return { status: "not-found" };

  const payment = await prisma.payment.findUnique({ where: selector });
  if (!payment) return { status: "not-found" };

  // THE GUARD. `updateMany` with `status: "CREATED"` in the WHERE means the
  // second caller matches zero rows and provisions nothing. A read-then-write
  // (`if (payment.status === "PAID") return`) would not be enough: both callers
  // can pass that check before either writes.
  const claimed = await prisma.payment.updateMany({
    where: { id: payment.id, status: "CREATED" },
    data: {
      status: "PAID",
      paidAt: new Date(),
      razorpayPaymentId: meta.razorpayPaymentId ?? payment.razorpayPaymentId,
    },
  });

  if (claimed.count === 0) {
    // Someone else got there first — or the payment was already failed or
    // refunded, in which case provisioning it now would be wrong anyway.
    const current = await prisma.payment.findUnique({ where: { id: payment.id } });
    return { status: "already-provisioned", payment: current ?? payment };
  }

  // Past the guard exactly once: safe to hand out plan time and credits.
  if (payment.grantPlan) {
    await activateMembership(payment.workspaceId, payment.grantPlan, {
      periodDays: payment.periodDays ?? BILLING_PERIOD_DAYS,
      provider: payment.provider,
      actorId: payment.userId,
      detail: `${PLANS[payment.grantPlan].label} plan payment`,
    });
  }

  if (payment.grantCredits && payment.grantCredits > 0) {
    await grantCredits(
      payment.workspaceId,
      payment.grantCredits,
      "ADD_ON_PURCHASE",
      `Credit pack (${payment.provider})`,
      payment.userId,
    );
  }

  const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
  return { status: "provisioned", payment: updated ?? payment };
}

/** Records a gateway-reported failure so it shows in payment history. */
export async function failPayment(
  where: { razorpayOrderId?: string; id?: string },
  reason: string,
) {
  const selector = where.id
    ? { id: where.id }
    : where.razorpayOrderId
      ? { razorpayOrderId: where.razorpayOrderId }
      : null;
  if (!selector) return null;

  // Only a payment still awaiting the customer can fail. Never overwrite a PAID
  // row — a late `payment.failed` for a retried attempt must not un-provision a
  // plan that was successfully paid for on the second try.
  const payment = await prisma.payment.findUnique({ where: selector });
  if (!payment || payment.status !== "CREATED") return payment;

  return prisma.payment.update({
    where: { id: payment.id },
    data: { status: "FAILED", failureReason: reason.slice(0, 500) },
  });
}

/** Price and grants for a plan purchase, resolved from the shared catalog. */
export function planPurchase(plan: BillingPlan) {
  const def = PLANS[plan];
  if (def.priceCents === null) return null; // Enterprise is not self-serve.
  return {
    amountCents: def.priceCents,
    grantPlan: plan,
    periodDays: BILLING_PERIOD_DAYS,
    label: `${def.label} plan — 30 days`,
  };
}

/** Price and grants for a credit-pack purchase. */
export function creditPurchase(packKey: string) {
  const pack = creditPack(packKey);
  if (!pack) return null;
  return {
    amountCents: pack.priceCents,
    grantCredits: pack.credits,
    label: `${pack.credits.toLocaleString("en-US")} credits`,
  };
}

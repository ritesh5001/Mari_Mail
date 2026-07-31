import {
  prisma,
  type BillingPlan,
  type PaymentLink,
  type Prisma,
} from "@marimail/db";
import { applyPlanToWorkspace, getStripe, grantCredits } from "./billing.service.js";

/**
 * Admin-created payment links for (usually Enterprise) deals.
 *
 * Flow: an admin decides what a customer gets — a plan, a country allowance,
 * and/or credits — for a negotiated price. They create a link that is either
 *   - STRIPE: a real hosted Stripe Payment Link we generate, or
 *   - MANUAL: any external URL the admin pastes (bank transfer, invoice, …).
 * On payment (a Stripe webhook for STRIPE, or an admin manually marking it paid
 * for MANUAL) we PROVISION the grants onto the workspace.
 *
 * Country access is stored + admin-controlled; it is NOT yet hard-enforced in
 * product flows (see schema note on Workspace.countryLimit).
 */

export type PaymentLinkGrants = {
  plan?: BillingPlan | null;
  countryLimit?: number | null;
  countries?: string[];
  credits?: number | null;
};

export type CreatePaymentLinkInput = {
  workspaceId: string;
  createdById: string | null;
  amountCents: number;
  currency?: string;
  description?: string | null;
  grants: PaymentLinkGrants;
} & (
  | { kind: "MANUAL"; url: string }
  | { kind: "STRIPE"; successUrl?: string }
);

const APP_URL = () => process.env.APP_URL ?? process.env.CLIENT_URL ?? "https://mail.maribiz.ai";

/**
 * Create a payment link. For MANUAL, we simply persist the admin-supplied URL.
 * For STRIPE, we create an ad-hoc Stripe Payment Link (inline price) whose
 * metadata carries our PaymentLink id so the webhook can fulfil it.
 */
export async function createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLink> {
  const {
    workspaceId,
    createdById,
    amountCents,
    currency = "usd",
    description,
    grants,
  } = input;

  const baseData: Prisma.PaymentLinkCreateInput = {
    workspace: { connect: { id: workspaceId } },
    ...(createdById ? { createdBy: { connect: { id: createdById } } } : {}),
    kind: input.kind,
    amountCents,
    currency,
    description: description ?? null,
    url: "", // filled below
    grantPlan: grants.plan ?? null,
    grantCountryLimit: grants.countryLimit ?? null,
    grantCountries: grants.countries ?? [],
    grantCredits: grants.credits ?? null,
  };

  if (input.kind === "MANUAL") {
    return prisma.paymentLink.create({ data: { ...baseData, url: input.url } });
  }

  // STRIPE: create the DB row first so we have an id for metadata, then create
  // the Stripe Payment Link and store its url/id back.
  const stripe = await getStripe();
  if (!stripe) {
    throw new PaymentLinkError("STRIPE_NOT_CONFIGURED", "Stripe is not configured on the server.");
  }

  const created = await prisma.paymentLink.create({ data: baseData });

  try {
    const price = await stripe.prices.create({
      currency,
      unit_amount: amountCents,
      product_data: { name: description || "MariMail Enterprise plan" },
    });

    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { paymentLinkId: created.id, workspaceId },
      after_completion: {
        type: "redirect",
        redirect: { url: input.successUrl ?? `${APP_URL()}/dashboard/billing?paid=1` },
      },
    });

    return prisma.paymentLink.update({
      where: { id: created.id },
      data: { url: link.url, stripePaymentLinkId: link.id },
    });
  } catch (err) {
    // Roll back the placeholder row so we don't leave an unusable link behind.
    await prisma.paymentLink.delete({ where: { id: created.id } }).catch(() => undefined);
    throw err;
  }
}

/**
 * Provision a paid payment link's grants onto its workspace, exactly once.
 * Idempotent: if already PAID, it is a no-op. Called from the Stripe webhook
 * and from the admin "mark paid" action.
 */
export async function fulfilPaymentLink(
  paymentLinkId: string,
  opts?: { stripeSessionId?: string; actorId?: string | null },
): Promise<PaymentLink | null> {
  const link = await prisma.paymentLink.findUnique({ where: { id: paymentLinkId } });
  if (!link) return null;
  if (link.status === "PAID") return link; // already fulfilled — idempotent
  if (link.status === "CANCELED") {
    throw new PaymentLinkError("LINK_CANCELED", "This payment link has been canceled.");
  }

  // Apply plan (which also resets vessel/email/inbox/team limits + credits).
  if (link.grantPlan) {
    await applyPlanToWorkspace(link.workspaceId, link.grantPlan, {
      billingStatus: "ACTIVE",
      actorId: opts?.actorId ?? link.createdById ?? null,
    });
  }

  // Apply country access (independent of plan).
  const countryData: Prisma.WorkspaceUpdateInput = {};
  if (link.grantCountryLimit != null) countryData.countryLimit = link.grantCountryLimit;
  if (link.grantCountries.length > 0) countryData.allowedCountries = link.grantCountries;
  if (Object.keys(countryData).length > 0) {
    await prisma.workspace.update({ where: { id: link.workspaceId }, data: countryData });
  }

  // Apply credit top-up.
  if (link.grantCredits && link.grantCredits > 0) {
    await grantCredits(
      link.workspaceId,
      link.grantCredits,
      "ADMIN_GRANT",
      `Payment link ${link.id}`,
      opts?.actorId ?? link.createdById ?? null,
    );
  }

  return prisma.paymentLink.update({
    where: { id: link.id },
    data: {
      status: "PAID",
      paidAt: new Date(),
      ...(opts?.stripeSessionId ? { stripeSessionId: opts.stripeSessionId } : {}),
    },
  });
}

/** Void a pending link. Does not touch already-provisioned access. */
export async function cancelPaymentLink(paymentLinkId: string): Promise<PaymentLink | null> {
  const link = await prisma.paymentLink.findUnique({ where: { id: paymentLinkId } });
  if (!link) return null;
  if (link.status === "PAID") {
    throw new PaymentLinkError("ALREADY_PAID", "Cannot cancel a link that has already been paid.");
  }
  // Best-effort deactivate the Stripe link so it can't still be paid.
  if (link.kind === "STRIPE" && link.stripePaymentLinkId) {
    const stripe = await getStripe();
    if (stripe) {
      await stripe.paymentLinks.update(link.stripePaymentLinkId, { active: false }).catch(() => undefined);
    }
  }
  return prisma.paymentLink.update({ where: { id: link.id }, data: { status: "CANCELED" } });
}

export class PaymentLinkError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "PaymentLinkError";
  }
}

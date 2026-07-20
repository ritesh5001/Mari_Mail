import { Router, raw } from "express";
import { z } from "zod";
import { prisma, type BillingPlan } from "@marimail/db";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import {
  applyPlanToWorkspace,
  CREDIT_PACK_CATALOG,
  PLAN_CATALOG,
  getStripe,
  grantCredits,
} from "../services/billing.service.js";

export const billingRouter = Router();
export const billingWebhookRouter = Router();

billingRouter.get("/plans", requireAuth, async (_req, res) => {
  return sendData(res, {
    plans: Object.values(PLAN_CATALOG),
    creditPacks: CREDIT_PACK_CATALOG,
  });
});

billingRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        plan: true,
        billingStatus: true,
        creditBalance: true,
        currentPeriodEnd: true,
        vesselLimit: true,
        emailLimit: true,
        inboxLimit: true,
        teamLimit: true,
        stripeCustomerId: true,
      },
    });
    if (!workspace) return sendError(res, 404, "NOT_FOUND", "Workspace not found");

    const sinceMonth = new Date();
    sinceMonth.setUTCDate(1);
    sinceMonth.setUTCHours(0, 0, 0, 0);

    const [vesselCount, monthlySent, ledger] = await Promise.all([
      prisma.vessel.count({ where: { workspaceId } }),
      prisma.emailEvent.count({ where: { workspaceId, eventType: "SENT", occurredAt: { gte: sinceMonth } } }),
      prisma.creditLedger.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    return sendData(res, {
      workspace,
      usage: {
        vessels: vesselCount,
        emailsThisMonth: monthlySent,
      },
      creditLedger: ledger,
    });
  } catch (error) {
    return next(error);
  }
});

const checkoutSchema = z.object({
  plan: z.enum(["STARTER", "PRO", "BUSINESS", "ENTERPRISE"]).optional(),
  creditPack: z.enum(["1000", "5000", "20000"]).optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

billingRouter.post("/checkout", requireAuth, async (req, res, next) => {
  try {
    const input = checkoutSchema.safeParse(req.body);
    if (!input.success) return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    if (!input.data.plan && !input.data.creditPack) {
      return sendError(res, 400, "VALIDATION_ERROR", "plan or creditPack is required");
    }
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const stripe = await getStripe();

    if (!stripe) {
      if (input.data.plan) {
        const workspace = await applyPlanToWorkspace(workspaceId, input.data.plan, {
          billingStatus: "ACTIVE",
          replenishCredits: true,
          actorId: userId,
        });
        return sendData(res, { devMode: true, workspace });
      }
      const pack = CREDIT_PACK_CATALOG.find((p) => p.packKey === input.data.creditPack);
      if (!pack) return sendError(res, 400, "VALIDATION_ERROR", "Unknown credit pack");
      const balance = await grantCredits(workspaceId, pack.credits, "ADD_ON_PURCHASE", `Dev mode credit pack ${pack.packKey}`, userId);
      return sendData(res, { devMode: true, creditBalance: balance });
    }

    const successUrl = input.data.successUrl ?? `${process.env.APP_URL ?? "http://localhost:3000"}/dashboard/settings/billing?success=1`;
    const cancelUrl = input.data.cancelUrl ?? `${process.env.APP_URL ?? "http://localhost:3000"}/dashboard/settings/billing?canceled=1`;

    let priceId: string | undefined;
    let mode: "subscription" | "payment" = "subscription";
    if (input.data.plan) {
      const def = PLAN_CATALOG[input.data.plan];
      if (def.stripePriceEnvVar) priceId = process.env[def.stripePriceEnvVar];
    } else if (input.data.creditPack) {
      const pack = CREDIT_PACK_CATALOG.find((p) => p.packKey === input.data.creditPack);
      if (pack?.stripePriceEnvVar) priceId = process.env[pack.stripePriceEnvVar];
      mode = "payment";
    }
    if (!priceId) return sendError(res, 500, "STRIPE_NOT_CONFIGURED", "Stripe price ID missing for selected plan/pack");

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: workspaceId,
      metadata: {
        workspaceId,
        userId,
        plan: input.data.plan ?? "",
        creditPack: input.data.creditPack ?? "",
      },
    });
    return sendData(res, { url: session.url, sessionId: session.id });
  } catch (error) {
    return next(error);
  }
});

billingRouter.post("/portal", requireAuth, async (req, res, next) => {
  try {
    const stripe = await getStripe();
    if (!stripe) return sendError(res, 503, "STRIPE_NOT_CONFIGURED", "Stripe not configured in this environment");
    const { workspaceId } = (req as AuthedRequest).auth;
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { stripeCustomerId: true } });
    if (!workspace?.stripeCustomerId) return sendError(res, 400, "NO_CUSTOMER", "Workspace has no Stripe customer yet");
    const portal = await stripe.billingPortal.sessions.create({
      customer: workspace.stripeCustomerId,
      return_url: `${process.env.APP_URL ?? "http://localhost:3000"}/dashboard/settings/billing`,
    });
    return sendData(res, { url: portal.url });
  } catch (error) {
    return next(error);
  }
});

billingWebhookRouter.post(
  "/webhook",
  raw({ type: "application/json" }),
  async (req, res, next) => {
    try {
      const stripe = await getStripe();
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!stripe || !secret) return sendError(res, 503, "STRIPE_NOT_CONFIGURED", "Stripe webhook secret missing");
      const signature = req.header("stripe-signature");
      if (!signature) return sendError(res, 400, "MISSING_SIGNATURE", "Missing stripe-signature header");
      const event = stripe.webhooks.constructEvent(req.body as Buffer, signature, secret);

      const existing = await prisma.billingEvent.findUnique({ where: { stripeEventId: event.id } });
      if (existing) return res.json({ ok: true, duplicate: true });

      const workspaceId =
        (event.data.object as { metadata?: Record<string, string>; client_reference_id?: string }).metadata?.workspaceId ??
        (event.data.object as { client_reference_id?: string }).client_reference_id ??
        null;

      if (workspaceId) {
        await prisma.billingEvent.create({
          data: {
            workspaceId,
            stripeEventId: event.id,
            eventType: event.type,
            payload: event.data.object as unknown as object,
          },
        });
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as { metadata?: Record<string, string>; customer?: string; subscription?: string };
          const plan = session.metadata?.plan as BillingPlan | undefined;
          const wsId = session.metadata?.workspaceId;
          if (wsId && plan) {
            await applyPlanToWorkspace(wsId, plan, {
              stripeCustomerId: typeof session.customer === "string" ? session.customer : undefined,
              stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
              billingStatus: "ACTIVE",
            });
          } else if (wsId && session.metadata?.creditPack) {
            const pack = CREDIT_PACK_CATALOG.find((p) => p.packKey === session.metadata?.creditPack);
            if (pack) {
              await grantCredits(wsId, pack.credits, "ADD_ON_PURCHASE", `Stripe pack ${pack.packKey}`);
            }
          }
          break;
        }
        case "customer.subscription.updated": {
          const sub = event.data.object as { customer: string; current_period_end?: number; status?: string };
          await prisma.workspace.updateMany({
            where: { stripeCustomerId: sub.customer },
            data: {
              currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end * 1000) : undefined,
              billingStatus: (sub.status?.toUpperCase() as never) ?? undefined,
            },
          });
          break;
        }
        case "customer.subscription.deleted": {
          const sub = event.data.object as { customer: string };
          await prisma.workspace.updateMany({
            where: { stripeCustomerId: sub.customer },
            data: { billingStatus: "CANCELED", plan: "STARTER" },
          });
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as { customer: string };
          await prisma.workspace.updateMany({
            where: { stripeCustomerId: invoice.customer },
            data: { billingStatus: "PAST_DUE" },
          });
          break;
        }
        default:
          break;
      }

      return res.json({ ok: true });
    } catch (error) {
      return next(error);
    }
  },
);

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@marimail/db";
import { requireSuperAdmin, type AuthedRequest } from "../../auth/middleware.js";
import { sendData, sendError } from "../../lib/http.js";
import {
  cancelPaymentLink,
  createPaymentLink,
  fulfilPaymentLink,
  PaymentLinkError,
} from "../../services/payment-link.service.js";

/**
 * Admin billing controls (super-admin only):
 *  - set a workspace's country access allowance (limit + specific countries),
 *  - create payment links (Stripe-generated or manual external URL),
 *  - mark a manual link paid / cancel a pending link,
 *  - list a workspace's links.
 */
export const adminBillingRouter = Router();

const BILLING_PLANS = ["STARTER", "PRO", "BUSINESS", "ENTERPRISE"] as const;

// --- Country access --------------------------------------------------------

const countryAccessSchema = z.object({
  workspaceId: z.string().min(1),
  countryLimit: z.number().int().min(0).max(1000),
  allowedCountries: z.array(z.string().min(1)).max(1000).optional(),
});

adminBillingRouter.patch("/country-access", requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = countryAccessSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId, countryLimit, allowedCountries } = parsed.data;

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) return sendError(res, 404, "NOT_FOUND", "Workspace not found");

    // Guard: can't grant more specific countries than the limit allows.
    if (allowedCountries && allowedCountries.length > countryLimit) {
      return sendError(
        res,
        400,
        "OVER_LIMIT",
        `Cannot grant ${allowedCountries.length} countries when the limit is ${countryLimit}.`,
      );
    }

    const updated = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        countryLimit,
        ...(allowedCountries ? { allowedCountries } : {}),
      },
      select: { id: true, name: true, countryLimit: true, allowedCountries: true },
    });
    return sendData(res, { workspace: updated });
  } catch (error) {
    return next(error);
  }
});

// --- Payment links ---------------------------------------------------------

const grantsSchema = z.object({
  plan: z.enum(BILLING_PLANS).nullable().optional(),
  countryLimit: z.number().int().min(0).max(1000).nullable().optional(),
  countries: z.array(z.string().min(1)).max(1000).optional(),
  credits: z.number().int().min(0).nullable().optional(),
});

const createLinkSchema = z
  .object({
    workspaceId: z.string().min(1),
    kind: z.enum(["STRIPE", "MANUAL"]),
    amountCents: z.number().int().min(0).max(100_000_000),
    currency: z.string().length(3).optional(),
    description: z.string().max(500).nullable().optional(),
    grants: grantsSchema.default({}),
    // MANUAL only:
    url: z.string().url().optional(),
    // STRIPE only:
    successUrl: z.string().url().optional(),
  })
  .refine((v) => v.kind !== "MANUAL" || Boolean(v.url), {
    message: "A url is required for a manual payment link.",
    path: ["url"],
  });

adminBillingRouter.post("/payment-links", requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = createLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    const data = parsed.data;
    const actorId = (req as AuthedRequest).auth.userId;

    // Guard grants coherence: specific countries can't exceed the granted limit.
    if (
      data.grants.countries &&
      data.grants.countryLimit != null &&
      data.grants.countries.length > data.grants.countryLimit
    ) {
      return sendError(res, 400, "OVER_LIMIT", "Granted countries exceed the granted country limit.");
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: data.workspaceId } });
    if (!workspace) return sendError(res, 404, "NOT_FOUND", "Workspace not found");

    const link = await createPaymentLink(
      data.kind === "MANUAL"
        ? {
            kind: "MANUAL",
            workspaceId: data.workspaceId,
            createdById: actorId,
            amountCents: data.amountCents,
            currency: data.currency,
            description: data.description,
            grants: data.grants,
            url: data.url as string,
          }
        : {
            kind: "STRIPE",
            workspaceId: data.workspaceId,
            createdById: actorId,
            amountCents: data.amountCents,
            currency: data.currency,
            description: data.description,
            grants: data.grants,
            successUrl: data.successUrl,
          },
    );
    return sendData(res, { paymentLink: link }, 201);
  } catch (error) {
    if (error instanceof PaymentLinkError) {
      return sendError(res, 400, error.code, error.message);
    }
    return next(error);
  }
});

adminBillingRouter.get("/payment-links", requireSuperAdmin, async (req, res, next) => {
  try {
    const workspaceId = typeof req.query.workspaceId === "string" ? req.query.workspaceId : undefined;
    const links = await prisma.paymentLink.findMany({
      where: workspaceId ? { workspaceId } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { workspace: { select: { id: true, name: true } } },
    });
    return sendData(res, { paymentLinks: links });
  } catch (error) {
    return next(error);
  }
});

// Manually mark a link paid (for MANUAL links, or to force-provision).
adminBillingRouter.post("/payment-links/:id/mark-paid", requireSuperAdmin, async (req, res, next) => {
  try {
    const actorId = (req as AuthedRequest).auth.userId;
    const link = await fulfilPaymentLink(req.params.id, { actorId });
    if (!link) return sendError(res, 404, "NOT_FOUND", "Payment link not found");
    return sendData(res, { paymentLink: link });
  } catch (error) {
    if (error instanceof PaymentLinkError) {
      return sendError(res, 400, error.code, error.message);
    }
    return next(error);
  }
});

adminBillingRouter.post("/payment-links/:id/cancel", requireSuperAdmin, async (req, res, next) => {
  try {
    const link = await cancelPaymentLink(req.params.id);
    if (!link) return sendError(res, 404, "NOT_FOUND", "Payment link not found");
    return sendData(res, { paymentLink: link });
  } catch (error) {
    if (error instanceof PaymentLinkError) {
      return sendError(res, 400, error.code, error.message);
    }
    return next(error);
  }
});

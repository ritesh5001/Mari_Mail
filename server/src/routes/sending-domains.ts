import { prisma } from "@marimail/db";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { checkDnsHealth } from "../services/dns-health.service.js";

export const sendingDomainRouter = Router();

const providerSchema = z.enum([
  "RESEND",
  "SENDGRID",
  "POSTMARK",
  "SES",
  "MAILGUN",
]);

const createSchema = z.object({
  domain: z.string().trim().min(3),
  provider: providerSchema,
  trackingDomain: z.string().trim().min(3).optional(),
  bounceDomain: z.string().trim().min(3).optional(),
});

function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

sendingDomainRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const domains = await prisma.sendingDomain.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return sendData(res, { domains });
  } catch (error) {
    return next(error);
  }
});

sendingDomainRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(
        res,
        400,
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Invalid input",
      );
    }
    const { workspaceId } = (req as AuthedRequest).auth;
    const domain = normalizeDomain(parsed.data.domain);
    const dns = await checkDnsHealth(`postmaster@${domain}`);
    const record = await prisma.sendingDomain.upsert({
      where: {
        workspaceId_domain_provider: {
          workspaceId,
          domain,
          provider: parsed.data.provider,
        },
      },
      update: {
        trackingDomain: parsed.data.trackingDomain,
        bounceDomain: parsed.data.bounceDomain,
        spfOk: dns.spfOk,
        dkimOk: dns.dkimOk,
        dmarcOk: dns.dmarcOk,
        status: dns.spfOk && dns.dkimOk && dns.dmarcOk ? "VERIFIED" : "PENDING",
        verifiedAt: dns.spfOk && dns.dkimOk && dns.dmarcOk ? new Date() : null,
      },
      create: {
        workspaceId,
        domain,
        provider: parsed.data.provider,
        trackingDomain: parsed.data.trackingDomain,
        bounceDomain: parsed.data.bounceDomain,
        spfOk: dns.spfOk,
        dkimOk: dns.dkimOk,
        dmarcOk: dns.dmarcOk,
        status: dns.spfOk && dns.dkimOk && dns.dmarcOk ? "VERIFIED" : "PENDING",
        verifiedAt:
          dns.spfOk && dns.dkimOk && dns.dmarcOk ? new Date() : undefined,
      },
    });
    return sendData(res, { domain: record, dns }, 201);
  } catch (error) {
    return next(error);
  }
});

sendingDomainRouter.post("/:id/verify", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.sendingDomain.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!existing)
      return sendError(res, 404, "NOT_FOUND", "Sending domain not found");

    const dns = await checkDnsHealth(`postmaster@${existing.domain}`);
    const verified = dns.spfOk && dns.dkimOk && dns.dmarcOk;
    const domain = await prisma.sendingDomain.update({
      where: { id: existing.id },
      data: {
        spfOk: dns.spfOk,
        dkimOk: dns.dkimOk,
        dmarcOk: dns.dmarcOk,
        status: verified ? "VERIFIED" : "PENDING",
        verifiedAt: verified ? new Date() : null,
      },
    });

    return sendData(res, { domain, dns });
  } catch (error) {
    return next(error);
  }
});

import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { cacheJson, workspaceCacheKey } from "../services/cache.service.js";
import {
  getCampaignFunnel,
  getOperatorIntelligence,
  getOverviewKpis,
  getPortPerformance,
  getVesselCrmHistory,
} from "../services/analytics.service.js";

export const analyticsRouter = Router();

const rangeSchema = z.object({ days: z.coerce.number().int().min(7).max(180).default(30) });

analyticsRouter.get("/overview", requireAuth, async (req, res, next) => {
  try {
    const input = rangeSchema.safeParse(req.query);
    if (!input.success) return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid range");
    const { workspaceId } = (req as AuthedRequest).auth;
    const overview = await cacheJson(
      workspaceCacheKey(workspaceId, `analytics:overview:${input.data.days}`),
      60,
      () => getOverviewKpis(workspaceId, input.data.days),
    );
    return sendData(res, overview);
  } catch (error) {
    return next(error);
  }
});

analyticsRouter.get("/campaigns/:id", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const funnel = await cacheJson(
      workspaceCacheKey(workspaceId, `analytics:campaign:${req.params.id}`),
      60,
      () => getCampaignFunnel(workspaceId, req.params.id),
    );
    if (!funnel) return sendError(res, 404, "NOT_FOUND", "Campaign not found");
    return sendData(res, funnel);
  } catch (error) {
    return next(error);
  }
});

analyticsRouter.get("/ports", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const data = await cacheJson(
      workspaceCacheKey(workspaceId, "analytics:ports"),
      120,
      () => getPortPerformance(workspaceId),
    );
    return sendData(res, data);
  } catch (error) {
    return next(error);
  }
});

analyticsRouter.get("/ports.csv", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const data = await getPortPerformance(workspaceId);
    const header = "Port Code,Port Name,Emails Sent,Open Rate,Reply Rate,Campaigns Active";
    const rows = data.ports.map((p) =>
      [p.portCode, JSON.stringify(p.portName), p.sent, p.openRate, p.replyRate, p.campaigns].join(","),
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=marimail-port-performance.csv");
    res.send([header, ...rows].join("\n"));
  } catch (error) {
    return next(error);
  }
});

analyticsRouter.get("/operators", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const data = await cacheJson(
      workspaceCacheKey(workspaceId, "analytics:operators"),
      120,
      () => getOperatorIntelligence(workspaceId),
    );
    return sendData(res, data);
  } catch (error) {
    return next(error);
  }
});

analyticsRouter.get("/vessels/:imo/crm", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const data = await getVesselCrmHistory(workspaceId, req.params.imo);
    if (!data) return sendError(res, 404, "NOT_FOUND", "Vessel not found");
    return sendData(res, data);
  } catch (error) {
    return next(error);
  }
});

const serviceSchema = z.object({
  serviceName: z.string().min(2),
  portCode: z.string().optional(),
  serviceDate: z.string().min(1),
  notes: z.string().optional(),
  amount: z.number().nullable().optional(),
  currency: z.string().optional(),
});

analyticsRouter.post("/vessels/:imo/services", requireAuth, async (req, res, next) => {
  try {
    const input = serviceSchema.safeParse(req.body);
    if (!input.success) return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const { prisma } = await import("@marimail/db");
    const vessel = await prisma.vessel.findFirst({ where: { imoNumber: req.params.imo, workspaceId } });
    if (!vessel) return sendError(res, 404, "NOT_FOUND", "Vessel not found");
    const record = await prisma.serviceRecord.create({
      data: {
        workspaceId,
        vesselId: vessel.id,
        serviceName: input.data.serviceName,
        portCode: input.data.portCode?.toUpperCase(),
        serviceDate: new Date(input.data.serviceDate),
        notes: input.data.notes,
        amount: input.data.amount ?? undefined,
        currency: input.data.currency ?? "USD",
        createdById: userId,
      },
    });
    return sendData(res, record, 201);
  } catch (error) {
    return next(error);
  }
});

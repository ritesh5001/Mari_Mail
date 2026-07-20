import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma } from "@marimail/db";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { workspaceScope } from "../services/workspace-scope.js";

export const portRuleRouter = Router();
export const cargoRuleRouter = Router();

const vesselTypeEnum = z.enum([
  "BULK_CARRIER",
  "TANKER_CRUDE",
  "TANKER_PRODUCT",
  "TANKER_CHEMICAL",
  "TANKER_LPG",
  "TANKER_LNG",
  "CONTAINER",
  "GENERAL_CARGO",
  "RORO",
  "OFFSHORE_PSV",
  "OFFSHORE_AHTS",
  "OFFSHORE_DRILL",
  "FERRY",
  "CRUISE",
  "DREDGER",
  "HEAVY_LIFT",
  "BARGE",
  "SUPPLY_BOAT",
  "RESEARCH",
  "OTHER",
]);

const portRuleSchema = z.object({
  portCode: z.string().min(2).max(10),
  vesselTypes: z.array(vesselTypeEnum).default([]),
  campaignId: z.string().min(1),
  autoEnroll: z.boolean().default(true),
  priority: z.number().int().default(100),
});

portRuleRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const rules = await prisma.portCampaignRule.findMany({
      where: workspaceScope(workspaceId) as Prisma.PortCampaignRuleWhereInput,
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      include: {
        campaign: { select: { id: true, name: true, status: true } },
        port: { select: { portCode: true, portName: true } },
      },
    });
    return sendData(res, { rules });
  } catch (error) {
    return next(error);
  }
});

portRuleRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = portRuleSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId } = (req as AuthedRequest).auth;
    const campaign = await prisma.campaign.findFirst({ where: { id: input.data.campaignId, workspaceId } });
    if (!campaign) return sendError(res, 404, "NOT_FOUND", "Campaign not found in workspace");

    const rule = await prisma.portCampaignRule.create({
      data: {
        portCode: input.data.portCode.toUpperCase(),
        vesselTypes: input.data.vesselTypes,
        campaignId: input.data.campaignId,
        autoEnroll: input.data.autoEnroll,
        priority: input.data.priority,
        workspaceId,
      },
    });
    return sendData(res, rule, 201);
  } catch (error) {
    return next(error);
  }
});

portRuleRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const input = portRuleSchema.partial().safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.portCampaignRule.findFirst({ where: { id: req.params.id, workspaceId } });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Rule not found");

    const updated = await prisma.portCampaignRule.update({
      where: { id: existing.id },
      data: {
        portCode: input.data.portCode?.toUpperCase(),
        vesselTypes: input.data.vesselTypes,
        campaignId: input.data.campaignId,
        autoEnroll: input.data.autoEnroll,
        priority: input.data.priority,
      },
    });
    return sendData(res, updated);
  } catch (error) {
    return next(error);
  }
});

portRuleRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.portCampaignRule.findFirst({ where: { id: req.params.id, workspaceId } });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Rule not found");
    await prisma.portCampaignRule.delete({ where: { id: existing.id } });
    return sendData(res, { id: existing.id });
  } catch (error) {
    return next(error);
  }
});

const cargoRuleSchema = z.object({
  previousCargo: z.array(z.string()).default([]),
  nextCargo: z.array(z.string()).default([]),
  vesselTypes: z.array(vesselTypeEnum).default([]),
  campaignId: z.string().min(1),
  autoEnroll: z.boolean().default(true),
});

cargoRuleRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const rules = await prisma.cargoChangeTrigger.findMany({
      where: workspaceScope(workspaceId) as Prisma.CargoChangeTriggerWhereInput,
      orderBy: { createdAt: "desc" },
      include: { campaign: { select: { id: true, name: true, status: true } } },
    });
    return sendData(res, { rules });
  } catch (error) {
    return next(error);
  }
});

cargoRuleRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = cargoRuleSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId } = (req as AuthedRequest).auth;
    const campaign = await prisma.campaign.findFirst({ where: { id: input.data.campaignId, workspaceId } });
    if (!campaign) return sendError(res, 404, "NOT_FOUND", "Campaign not found in workspace");

    const rule = await prisma.cargoChangeTrigger.create({
      data: {
        previousCargo: input.data.previousCargo.map((value) => value.toUpperCase()),
        nextCargo: input.data.nextCargo.map((value) => value.toUpperCase()),
        vesselTypes: input.data.vesselTypes,
        campaignId: input.data.campaignId,
        autoEnroll: input.data.autoEnroll,
        workspaceId,
      },
    });
    return sendData(res, rule, 201);
  } catch (error) {
    return next(error);
  }
});

cargoRuleRouter.patch("/:id", requireAuth, async (req, res, next) => {
  try {
    const input = cargoRuleSchema.partial().safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.cargoChangeTrigger.findFirst({ where: { id: req.params.id, workspaceId } });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Rule not found");
    const updated = await prisma.cargoChangeTrigger.update({
      where: { id: existing.id },
      data: {
        previousCargo: input.data.previousCargo?.map((v) => v.toUpperCase()),
        nextCargo: input.data.nextCargo?.map((v) => v.toUpperCase()),
        vesselTypes: input.data.vesselTypes,
        campaignId: input.data.campaignId,
        autoEnroll: input.data.autoEnroll,
      },
    });
    return sendData(res, updated);
  } catch (error) {
    return next(error);
  }
});

cargoRuleRouter.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.cargoChangeTrigger.findFirst({ where: { id: req.params.id, workspaceId } });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Rule not found");
    await prisma.cargoChangeTrigger.delete({ where: { id: existing.id } });
    return sendData(res, { id: existing.id });
  } catch (error) {
    return next(error);
  }
});

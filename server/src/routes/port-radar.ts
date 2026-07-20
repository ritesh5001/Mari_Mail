import { Prisma } from "@marimail/db";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@marimail/db";
import { filterConfigToWhereClause } from "@marimail/utils";
import type { FilterConfig } from "@marimail/types";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { workspaceStrictScope } from "../services/workspace-scope.js";

export const portRadarRouter = Router();

const filterConfigSchema = z.object({
  entityType: z.literal("ETA"),
  groupLogic: z.enum(["AND", "OR"]),
  groups: z.array(
    z.object({
      conditions: z.array(
        z.object({ field: z.string(), operator: z.string(), value: z.unknown().optional() }),
      ),
    }),
  ),
  sortBy: z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) }).optional(),
}) satisfies z.ZodType<FilterConfig>;

const feedSchema = z.object({
  filterConfig: filterConfigSchema.optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).default(50),
});

portRadarRouter.post("/feed", requireAuth, async (req, res, next) => {
  try {
    const input = feedSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId } = (req as AuthedRequest).auth;
    const translated = input.data.filterConfig
      ? (filterConfigToWhereClause(input.data.filterConfig) as Prisma.VesselETAWhereInput)
      : {};
    const where: Prisma.VesselETAWhereInput = {
      AND: [
        // Include workspace-owned + global (super-admin) ETAs.
        { OR: [workspaceStrictScope(workspaceId), { workspaceId: null }] },
        { eta: { gte: new Date() } },
        translated,
      ],
    };

    const etas = await prisma.vesselETA.findMany({
      where,
      orderBy: { eta: "asc" },
      take: input.data.limit + 1,
      cursor: input.data.cursor ? { id: input.data.cursor } : undefined,
      skip: input.data.cursor ? 1 : 0,
      include: {
        vessel: {
          select: {
            id: true,
            imoNumber: true,
            vesselName: true,
            vesselType: true,
            flag: true,
            dwt: true,
            shipOwnerCompany: { select: { id: true, companyName: true, email: true, country: true } },
            ismManagerCompany: { select: { id: true, companyName: true, email: true, country: true } },
            commercialManagerCompany: { select: { id: true, companyName: true, email: true } },
          },
        },
        port: { select: { portCode: true, portName: true, region: true } },
        triggers: {
          select: {
            id: true,
            status: true,
            nextFireAt: true,
            campaign: { select: { id: true, name: true } },
          },
        },
      },
    });

    const hasMore = etas.length > input.data.limit;
    const slice = hasMore ? etas.slice(0, input.data.limit) : etas;
    const nextCursor = hasMore ? slice[slice.length - 1]?.id ?? null : null;

    return sendData(res, { etas: slice, nextCursor });
  } catch (error) {
    return next(error);
  }
});

portRadarRouter.get("/summary", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setUTCDate(endOfToday.getUTCDate() + 1);
    const endOfTomorrow = new Date(startOfToday);
    endOfTomorrow.setUTCDate(endOfTomorrow.getUTCDate() + 2);
    const endOfWeek = new Date(startOfToday);
    endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 7);

    // Include workspace-owned + global (super-admin) ETAs everywhere Port
    // Radar counts / lists rows.
    const base: Prisma.VesselETAWhereInput = {
      OR: [workspaceStrictScope(workspaceId), { workspaceId: null }],
    };

    const [today, tomorrow, thisWeek, noCampaign, activeCampaign] = await Promise.all([
      prisma.vesselETA.count({ where: { AND: [base, { eta: { gte: startOfToday, lt: endOfToday } }] } }),
      prisma.vesselETA.count({ where: { AND: [base, { eta: { gte: endOfToday, lt: endOfTomorrow } }] } }),
      prisma.vesselETA.count({ where: { AND: [base, { eta: { gte: startOfToday, lt: endOfWeek } }] } }),
      prisma.vesselETA.count({
        where: { AND: [base, { eta: { gte: now } }, { triggers: { none: {} } }] },
      }),
      prisma.vesselETA.count({
        where: { AND: [base, { eta: { gte: now } }, { triggers: { some: { status: { in: ["PENDING", "ACTIVE"] } } } }] },
      }),
    ]);

    return sendData(res, { today, tomorrow, thisWeek, noCampaign, activeCampaign });
  } catch (error) {
    return next(error);
  }
});

portRadarRouter.get("/alerts", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const now = new Date();
    const in48h = new Date(now.getTime() + 48 * 3_600_000);

    // Include workspace-owned + global (super-admin) ETAs everywhere Port
    // Radar counts / lists rows.
    const base: Prisma.VesselETAWhereInput = {
      OR: [workspaceStrictScope(workspaceId), { workspaceId: null }],
    };

    const urgent = await prisma.vesselETA.findMany({
      where: { AND: [base, { eta: { gte: now, lte: in48h } }, { triggers: { none: {} } }] },
      orderBy: { eta: "asc" },
      take: 20,
      include: {
        vessel: { select: { imoNumber: true, vesselName: true, vesselType: true, flag: true } },
        port: { select: { portCode: true, portName: true } },
      },
    });

    const recentlyShifted = await prisma.vesselETA.findMany({
      where: {
        AND: [
          base,
          { eta: { gte: now } },
          { updatedAt: { gte: new Date(now.getTime() - 24 * 3_600_000) } },
          { triggers: { none: {} } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: {
        vessel: { select: { imoNumber: true, vesselName: true, vesselType: true } },
        port: { select: { portCode: true, portName: true } },
      },
    });

    return sendData(res, {
      urgent: urgent.map((eta) => ({
        id: eta.id,
        reason: "ETA within 48 hours with no campaign",
        vessel: eta.vessel,
        eta: eta.eta,
        port: eta.port,
      })),
      shifted: recentlyShifted.map((eta) => ({
        id: eta.id,
        reason: "ETA updated recently with no campaign",
        vessel: eta.vessel,
        eta: eta.eta,
        port: eta.port,
      })),
    });
  } catch (error) {
    return next(error);
  }
});


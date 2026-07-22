import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma } from "@marimail/db";
import { filterConfigToWhereClause } from "@marimail/utils";
import type { FilterConfig } from "@marimail/types";
import { requireAuth, requireSuperAdmin, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import {
  CREDIT_COST,
  CreditDeductionError,
  deductCredits,
} from "../services/billing.service.js";
import { cacheJson, workspaceCacheKey } from "../services/cache.service.js";
import { serializeVessel, vesselInclude } from "../services/serializers.js";
import { VESSEL_CSV_HEADERS, vesselDataFromCsvRow, vesselToCsvRow } from "../services/vessel-data.js";
import { workspaceScope } from "../services/workspace-scope.js";

export const vesselRouter = Router();

const filterConfigSchema = z.object({
  entityType: z.literal("VESSEL"),
  groupLogic: z.enum(["AND", "OR"]),
  groups: z.array(
    z.object({
      conditions: z.array(
        z.object({
          field: z.string(),
          operator: z.string(),
          value: z.unknown().optional(),
        }),
      ),
    }),
  ),
  sortBy: z
    .object({
      field: z.string(),
      direction: z.enum(["asc", "desc"]),
    })
    .optional(),
}) satisfies z.ZodType<FilterConfig>;

const searchSchema = z.object({
  filterConfig: filterConfigSchema,
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

const sortableFields = new Set(["vesselName", "imoNumber", "flag", "vesselType", "dwt", "builtYear", "createdAt", "updatedAt"]);

function parseLimit(input: unknown) {
  const parsed = Number(input ?? 50);
  if (!Number.isFinite(parsed)) {
    return 50;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function orderByFor(filterConfig?: FilterConfig): Prisma.VesselOrderByWithRelationInput {
  const sort = filterConfig?.sortBy;
  if (!sort || !sortableFields.has(sort.field)) {
    return { vesselName: "asc" };
  }

  return { [sort.field]: sort.direction };
}

vesselRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const limit = parseLimit(req.query.limit);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const where: Prisma.VesselWhereInput = {
      AND: [
        workspaceScope(workspaceId),
        q
          ? {
              OR: [
                { vesselName: { contains: q, mode: "insensitive" } },
                { imoNumber: { contains: q, mode: "insensitive" } },
                { mmsi: { contains: q, mode: "insensitive" } },
                { callsign: { contains: q, mode: "insensitive" } },
                { globalArea: { contains: q, mode: "insensitive" } },
                { currentPortUnlocode: { contains: q, mode: "insensitive" } },
                { currentPortCountry: { contains: q, mode: "insensitive" } },
                { destination: { contains: q, mode: "insensitive" } },
                { vesselTypeDetailed: { contains: q, mode: "insensitive" } },
                { commercialMarket: { contains: q, mode: "insensitive" } },
                { commercialManagerName: { contains: q, mode: "insensitive" } },
                { registeredOwnerName: { contains: q, mode: "insensitive" } },
                { beneficialOwnerName: { contains: q, mode: "insensitive" } },
                { technicalManagerName: { contains: q, mode: "insensitive" } },
                { pAndIClubName: { contains: q, mode: "insensitive" } },
                { shipBuilderName: { contains: q, mode: "insensitive" } },
                { classSocietyName: { contains: q, mode: "insensitive" } },
                { engineBuilderName: { contains: q, mode: "insensitive" } },
                { ismManagerName: { contains: q, mode: "insensitive" } },
                { operatorName: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const vessels = await prisma.vessel.findMany({
      where,
      include: vesselInclude,
      orderBy: { vesselName: "asc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasNextPage = vessels.length > limit;
    const page = vessels.slice(0, limit);

    return sendData(res, {
      vessels: page.map(serializeVessel),
      nextCursor: hasNextPage ? page.at(-1)?.id ?? null : null,
    });
  } catch (error) {
    return next(error);
  }
});

vesselRouter.post("/search", requireAuth, async (req, res, next) => {
  try {
    const input = searchSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    const translatedWhere = filterConfigToWhereClause(input.data.filterConfig) as Prisma.VesselWhereInput;
    const where: Prisma.VesselWhereInput = {
      AND: [workspaceScope(workspaceId), translatedWhere],
    };

    const [vessels, count] = await Promise.all([
      prisma.vessel.findMany({
        where,
        include: vesselInclude,
        orderBy: orderByFor(input.data.filterConfig),
        take: input.data.limit + 1,
        ...(input.data.cursor ? { cursor: { id: input.data.cursor }, skip: 1 } : {}),
      }),
      prisma.vessel.count({ where }),
    ]);

    const hasNextPage = vessels.length > input.data.limit;
    const page = vessels.slice(0, input.data.limit);

    return sendData(res, {
      vessels: page.map(serializeVessel),
      count,
      nextCursor: hasNextPage ? page.at(-1)?.id ?? null : null,
    });
  } catch (error) {
    return next(error);
  }
});

vesselRouter.get("/:imoNumber", requireAuth, async (req, res, next) => {
  try {
    const imoNumber = req.params.imoNumber;
    if (!/^\d{7}$/.test(imoNumber)) {
      return sendError(res, 400, "INVALID_IMO", "IMO number must be exactly 7 digits");
    }

    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const cacheKey = workspaceCacheKey(workspaceId, `vessel:${imoNumber}`);
    const vessel = await cacheJson(cacheKey, 300, () =>
      prisma.vessel.findFirst({
        where: { imoNumber, ...workspaceScope(workspaceId) },
        include: vesselInclude,
      }),
    );

    if (!vessel) {
      return sendError(res, 404, "VESSEL_NOT_FOUND", "Vessel not found");
    }

    if (!vessel.workspaceId) {
      const viewer = await prisma.user.findUnique({
        where: { id: userId },
        select: { isSuperAdmin: true },
      });
      if (!viewer?.isSuperAdmin) {
        try {
          await deductCredits(workspaceId, CREDIT_COST.VIEW_VESSEL, "VIEW_VESSEL", `Viewed global vessel ${imoNumber}`, userId);
        } catch (creditError) {
          if (creditError instanceof CreditDeductionError) {
            return sendError(res, 402, "INSUFFICIENT_CREDITS", creditError.message);
          }
          throw creditError;
        }
      }
    }

    return sendData(res, serializeVessel(vessel));
  } catch (error) {
    return next(error);
  }
});

vesselRouter.post("/:imoNumber/save", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const imoNumber = req.params.imoNumber;
    const source = await prisma.vessel.findFirst({ where: { imoNumber, workspaceId: null } });
    if (!source) return sendError(res, 404, "NOT_FOUND", "Global vessel not found");
    try {
      await deductCredits(workspaceId, CREDIT_COST.SAVE_VESSEL, "SAVE_VESSEL", `Saved global vessel ${imoNumber}`, userId);
    } catch (creditError) {
      if (creditError instanceof CreditDeductionError) {
        return sendError(res, 402, "INSUFFICIENT_CREDITS", creditError.message);
      }
      throw creditError;
    }

    const cloned = await prisma.vessel.create({
      data: {
        imoNumber: `${imoNumber}-ws-${workspaceId.slice(-4)}`,
        vesselName: `${source.vesselName} (saved)`,
        mmsi: source.mmsi,
        callsign: source.callsign,
        flag: source.flag,
        vesselType: source.vesselType,
        dwt: source.dwt,
        grossTonnage: source.grossTonnage,
        builtYear: source.builtYear,
        workspaceId,
        source: "INTERNAL",
      },
    });
    return sendData(res, cloned, 201);
  } catch (error) {
    return next(error);
  }
});

const exportSchema = z.object({ imoNumbers: z.array(z.string().regex(/^\d{7}$/)).min(1).max(500) });

vesselRouter.post("/export", requireAuth, async (req, res, next) => {
  try {
    const input = exportSchema.safeParse(req.body);
    if (!input.success) return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const vessels = await prisma.vessel.findMany({
      where: { imoNumber: { in: input.data.imoNumbers }, workspaceId: null },
      include: {
        shipOwnerCompany: true,
        ismManagerCompany: true,
        commercialManagerCompany: true,
        etas: {
          where: { eta: { gte: new Date() } },
          orderBy: { eta: "asc" },
          take: 1,
          select: { eta: true },
        },
      },
    });
    if (vessels.length === 0) return sendError(res, 404, "NOT_FOUND", "No matching global vessels");
    const cost = CREDIT_COST.EXPORT_VESSEL * vessels.length;
    try {
      await deductCredits(workspaceId, cost, "EXPORT_VESSEL", `Export ${vessels.length} vessels`, userId);
    } catch (creditError) {
      if (creditError instanceof CreditDeductionError) {
        return sendError(res, 402, "INSUFFICIENT_CREDITS", creditError.message);
      }
      throw creditError;
    }
    const rows = vessels.map(vesselToCsvRow);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=marimail-global-vessels.csv");
    return res.send([VESSEL_CSV_HEADERS.join(","), ...rows].join("\n"));
  } catch (error) {
    return next(error);
  }
});

// ── Manual create vessel ──────────────────────────────────────────────────────

const optionalText = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().optional(),
);
const optionalNumber = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    if (typeof value === "string") return Number(value.replace(/,/g, ""));
    return value;
  },
  z.number().finite().optional(),
);
const optionalPositiveInt = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    if (typeof value === "string") return Number(value.replace(/,/g, ""));
    return value;
  },
  z.number().int().positive().optional(),
);
const optionalBuiltYear = z.preprocess(
  (value) => {
    if (value === "" || value === null || value === undefined) return undefined;
    if (typeof value === "string") return Number(value.replace(/,/g, ""));
    return value;
  },
  z.number().int().min(1900).max(new Date().getFullYear() + 2).optional(),
);

const createVesselSchema = z.object({
  imoNumber: z.string().regex(/^\d{7}$/, "IMO must be exactly 7 digits"),
  vesselName: z.string().min(1),
  vesselType: z.enum(["BULK_CARRIER","TANKER_CRUDE","TANKER_PRODUCT","TANKER_CHEMICAL","TANKER_LPG","TANKER_LNG","CONTAINER","GENERAL_CARGO","RORO","OFFSHORE_PSV","OFFSHORE_AHTS","OFFSHORE_DRILL","FERRY","CRUISE","DREDGER","HEAVY_LIFT","BARGE","SUPPLY_BOAT","RESEARCH","OTHER"]).default("OTHER"),
  flag: optionalText,
  mmsi: optionalText,
  callsign: optionalText,
  globalArea: optionalText,
  eni: optionalText,
  speed: optionalNumber,
  course: optionalNumber,
  draught: optionalNumber,
  navigationalStatus: optionalText,
  destination: optionalText,
  aisClass: optionalText,
  lengthOverall: optionalNumber,
  width: optionalNumber,
  dwt: optionalPositiveInt,
  currentPortUnlocode: optionalText,
  currentPortCountry: optionalText,
  draughtMax: optionalNumber,
  draughtMin: optionalNumber,
  yardNumber: optionalText,
  vesselTypeDetailed: optionalText,
  grossTonnage: optionalPositiveInt,
  netTonnage: optionalPositiveInt,
  capacityDwt: optionalPositiveInt,
  capacityGt: optionalPositiveInt,
  capacityTeu: optionalPositiveInt,
  capacityLiquidGas: optionalPositiveInt,
  capacityPassengers: optionalPositiveInt,
  lengthBetweenPerpendiculars: optionalNumber,
  depth: optionalNumber,
  breadth: optionalNumber,
  breadthExtreme: optionalNumber,
  capacityLiquidOil: optionalPositiveInt,
  commercialMarket: optionalText,
  commercialSizeClass: optionalText,
  firstAisPositionDate: optionalText,
  commercialManagerName: optionalText,
  commercialManagerEmail: optionalText,
  commercialManagerCity: optionalText,
  commercialManagerCountry: optionalText,
  registeredOwnerName: optionalText,
  registeredOwnerEmail: optionalText,
  registeredOwnerCity: optionalText,
  registeredOwnerCountry: optionalText,
  beneficialOwnerName: optionalText,
  beneficialOwnerEmail: optionalText,
  beneficialOwnerCity: optionalText,
  beneficialOwnerCountry: optionalText,
  technicalManagerName: optionalText,
  technicalManagerEmail: optionalText,
  technicalManagerCity: optionalText,
  technicalManagerCountry: optionalText,
  pAndIClubName: optionalText,
  pAndIClubEmail: optionalText,
  pAndIClubCity: optionalText,
  pAndIClubCountry: optionalText,
  shipBuilderName: optionalText,
  shipBuilderEmail: optionalText,
  shipBuilderCity: optionalText,
  shipBuilderCountry: optionalText,
  classSocietyName: optionalText,
  classSocietyEmail: optionalText,
  classSocietyCity: optionalText,
  classSocietyCountry: optionalText,
  engineBuilderName: optionalText,
  engineBuilderEmail: optionalText,
  engineBuilderCity: optionalText,
  engineBuilderCountry: optionalText,
  ismManagerName: optionalText,
  ismManagerEmail: optionalText,
  ismManagerCity: optionalText,
  ismManagerCountry: optionalText,
  operatorName: optionalText,
  operatorEmail: optionalText,
  operatorCity: optionalText,
  operatorCountry: optionalText,
  draft: optionalNumber,
  classificationSociety: optionalText,
  builtYear: optionalBuiltYear,
});

function normalizeCreateVesselBody(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }

  const row: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value !== null && value !== undefined) {
      row[key] = String(value);
    }
  }

  return {
    ...vesselDataFromCsvRow(row),
    ...body,
  };
}

const updateVesselSchema = createVesselSchema.partial().extend({
  imoNumber: z.string().regex(/^\d{7}$/, "IMO must be exactly 7 digits").optional(),
  vesselName: z.string().min(1).optional(),
});

vesselRouter.patch("/:imoNumber", requireAuth, requireSuperAdmin, async (req, res, next) => {
  try {
    const imoNumber = req.params.imoNumber;
    if (!/^\d{7}$/.test(imoNumber)) {
      return sendError(res, 400, "INVALID_IMO", "IMO number must be exactly 7 digits");
    }

    const input = updateVesselSchema.safeParse(normalizeCreateVesselBody(req.body));
    if (!input.success) return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");

    const { workspaceId } = (req as AuthedRequest).auth;
    const existing = await prisma.vessel.findFirst({
      where: { imoNumber, ...workspaceScope(workspaceId) },
      select: { id: true, workspaceId: true },
    });
    if (!existing) return sendError(res, 404, "VESSEL_NOT_FOUND", "Vessel not found");

    // Rename guardrail: if changing IMO, block clashes with another vessel
    // in the same workspace (or an unowned global vessel with that IMO).
    if (input.data.imoNumber && input.data.imoNumber !== imoNumber) {
      const clash = await prisma.vessel.findFirst({
        where: {
          imoNumber: input.data.imoNumber,
          NOT: { id: existing.id },
          OR: [{ workspaceId }, { workspaceId: null }],
        },
        select: { id: true },
      });
      if (clash) return sendError(res, 409, "DUPLICATE", "Another vessel with this IMO already exists");
    }

    const data: Prisma.VesselUpdateInput = {};
    for (const [key, value] of Object.entries(input.data)) {
      if (value === undefined) continue;
      (data as Record<string, unknown>)[key] = value;
    }

    const vessel = await prisma.vessel.update({
      where: { id: existing.id },
      data,
      include: vesselInclude,
    });

    return sendData(res, serializeVessel(vessel));
  } catch (error) {
    return next(error);
  }
});

vesselRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = createVesselSchema.safeParse(normalizeCreateVesselBody(req.body));
    if (!input.success) return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");

    // Vessels are shared globally by IMO. If the IMO already exists in the DB
    // (from any workspace's import or a global row), refresh its fields with
    // the values the user just submitted rather than 409'ing — the caller's
    // add still succeeds and everyone benefits from the updated data. New
    // IMOs land as workspaceId=null so every workspace can see them.
    const existing = await prisma.vessel.findUnique({
      where: { imoNumber: input.data.imoNumber },
      select: { id: true },
    });

    const shared = {
      ...input.data,
      capacityDwt: input.data.capacityDwt ?? input.data.dwt,
      capacityGt: input.data.capacityGt ?? input.data.grossTonnage,
      draught: input.data.draught ?? input.data.draft,
      draft: input.data.draft ?? input.data.draught,
    };

    const vessel = existing
      ? await prisma.vessel.update({
          where: { id: existing.id },
          data: shared,
          include: vesselInclude,
        })
      : await prisma.vessel.create({
          data: {
            ...shared,
            workspaceId: null,
            source: "MANUAL",
            verified: false,
          },
          include: vesselInclude,
        });

    return sendData(res, serializeVessel(vessel), existing ? 200 : 201);
  } catch (error) {
    return next(error);
  }
});

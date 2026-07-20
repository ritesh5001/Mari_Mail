import { Router } from "express";
import { Prisma, prisma } from "@marimail/db";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { serializeVessel, vesselInclude } from "../services/serializers.js";
import { workspaceScope } from "../services/workspace-scope.js";

export const companyRouter = Router();

const companyKinds = new Set(["ship-owners", "ism-managers", "commercial-managers"]);

const KIND_TO_ENUM = {
  "ship-owners": "SHIP_OWNER",
  "ism-managers": "ISM_MANAGER",
  "commercial-managers": "COMMERCIAL_MANAGER",
} as const;

function companyScope(workspaceId: string) {
  return workspaceScope(workspaceId);
}

companyRouter.get("/search", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const kindFilter = typeof req.query.kind === "string" ? req.query.kind : "";

    const search = q
      ? { companyName: { contains: q, mode: "insensitive" as const } }
      : {};
    const where = { AND: [companyScope(workspaceId), search] };
    const select = { id: true, companyName: true, country: true, fleetSize: true } as const;
    const take = 25;

    const includeOwner = !kindFilter || kindFilter === "ship-owners";
    const includeIsm = !kindFilter || kindFilter === "ism-managers";
    const includeCommercial = !kindFilter || kindFilter === "commercial-managers";

    const [shipOwners, ismManagers, commercials] = await Promise.all([
      includeOwner
        ? prisma.shipOwnerCompany.findMany({ where, select, orderBy: { companyName: "asc" }, take })
        : Promise.resolve([]),
      includeIsm
        ? prisma.iSMManagerCompany.findMany({ where, select, orderBy: { companyName: "asc" }, take })
        : Promise.resolve([]),
      includeCommercial
        ? prisma.commercialManagerCompany.findMany({ where, select, orderBy: { companyName: "asc" }, take })
        : Promise.resolve([]),
    ]);

    const results = [
      ...shipOwners.map((c) => ({ ...c, companyKind: KIND_TO_ENUM["ship-owners"] })),
      ...ismManagers.map((c) => ({ ...c, companyKind: KIND_TO_ENUM["ism-managers"] })),
      ...commercials.map((c) => ({ ...c, companyKind: KIND_TO_ENUM["commercial-managers"] })),
    ].sort((a, b) => a.companyName.localeCompare(b.companyName));

    return sendData(res, { results });
  } catch (error) {
    return next(error);
  }
});

companyRouter.get("/:kind/:id", requireAuth, async (req, res, next) => {
  try {
    const { kind, id } = req.params;
    if (!companyKinds.has(kind)) {
      return sendError(res, 404, "COMPANY_TYPE_NOT_FOUND", "Unknown company type");
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    const where = { id, ...companyScope(workspaceId) };

    const company =
      kind === "ship-owners"
        ? await prisma.shipOwnerCompany.findFirst({ where })
        : kind === "ism-managers"
          ? await prisma.iSMManagerCompany.findFirst({ where })
          : await prisma.commercialManagerCompany.findFirst({ where });

    if (!company) {
      return sendError(res, 404, "COMPANY_NOT_FOUND", "Company not found");
    }

    const vesselWhere: Prisma.VesselWhereInput = {
      AND: [
        workspaceScope(workspaceId),
        kind === "ship-owners"
          ? { shipOwnerCompanyId: id }
          : kind === "ism-managers"
            ? { ismManagerCompanyId: id }
            : { commercialManagerCompanyId: id },
      ],
    };

    const vessels = await prisma.vessel.findMany({
      where: vesselWhere,
      include: vesselInclude,
      orderBy: { vesselName: "asc" },
    });

    return sendData(res, {
      company,
      vessels: vessels.map(serializeVessel),
    });
  } catch (error) {
    return next(error);
  }
});

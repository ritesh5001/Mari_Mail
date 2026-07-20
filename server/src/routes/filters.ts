import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma } from "@marimail/db";
import type { FilterConfig } from "@marimail/types";
import { filterConfigToWhereClause } from "@marimail/utils";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { workspaceScope, workspaceStrictScope } from "../services/workspace-scope.js";
import { cacheJson, workspaceCacheKey } from "../services/cache.service.js";
import crypto from "node:crypto";

export const filterRouter = Router();

const filterConfigSchema = z.object({
  entityType: z.enum(["VESSEL", "CONTACT", "COMPANY", "ETA"]),
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

filterRouter.post("/preview", requireAuth, async (req, res, next) => {
  try {
    const input = filterConfigSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { workspaceId } = (req as AuthedRequest).auth;
    const translated = filterConfigToWhereClause(input.data);

    const hash = crypto.createHash("sha1").update(JSON.stringify(input.data)).digest("hex").slice(0, 16);
    const cacheKey = workspaceCacheKey(workspaceId, `filter:preview:${input.data.entityType}:${hash}`);
    const count = await cacheJson(cacheKey, 30, async () => {
      if (input.data.entityType === "CONTACT") {
        return prisma.contact.count({ where: { AND: [workspaceScope(workspaceId), translated as Prisma.ContactWhereInput] } });
      }
      if (input.data.entityType === "VESSEL") {
        return prisma.vessel.count({ where: { AND: [workspaceScope(workspaceId), translated as Prisma.VesselWhereInput] } });
      }
      if (input.data.entityType === "ETA") {
        // Include workspace-owned + global (super-admin authored) ETAs.
        return prisma.vesselETA.count({
          where: {
            AND: [
              { OR: [workspaceStrictScope(workspaceId), { workspaceId: null }] },
              translated as Prisma.VesselETAWhereInput,
            ],
          },
        });
      }
      return 0;
    });

    return sendData(res, { count });
  } catch (error) {
    return next(error);
  }
});

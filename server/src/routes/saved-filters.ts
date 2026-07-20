import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma } from "@marimail/db";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { workspaceScope } from "../services/workspace-scope.js";

export const savedFilterRouter = Router();

const createSchema = z.object({
  name: z.string().trim().min(2),
  entityType: z.enum(["VESSEL", "CONTACT", "COMPANY", "ETA"]),
  filterConfig: z.unknown(),
});

savedFilterRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const entityType = typeof req.query.entityType === "string" ? req.query.entityType : undefined;
    const filters = await prisma.savedFilter.findMany({
      where: {
        AND: [
          workspaceScope(workspaceId),
          entityType ? { entityType: entityType as "VESSEL" | "CONTACT" | "COMPANY" | "ETA" } : {},
          { OR: [{ createdById: userId }, { createdById: null }, { workspaceId }] },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    return sendData(res, { filters });
  } catch (error) {
    return next(error);
  }
});

savedFilterRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const input = createSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const filter = await prisma.savedFilter.create({
      data: {
        workspaceId,
        createdById: userId,
        name: input.data.name,
        entityType: input.data.entityType,
        filterConfig: input.data.filterConfig as Prisma.InputJsonValue,
      },
    });
    return sendData(res, filter, 201);
  } catch (error) {
    return next(error);
  }
});

import { Router } from "express";
import { z } from "zod";
import { prisma } from "@marimail/db";
import { requireAuth } from "../auth/middleware.js";
import { sendData, sendError } from "../lib/http.js";
import { cacheJson } from "../services/cache.service.js";

export const portRouter = Router();

const listSchema = z.object({
  q: z.string().optional(),
  region: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

portRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const input = listSchema.safeParse(req.query);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid query");
    }

    const { q, region, limit } = input.data;
    const cacheKey = `ports:list:${q ?? ""}:${region ?? ""}:${limit}`;
    const ports = await cacheJson(cacheKey, 3600, () =>
      prisma.port.findMany({
        where: {
          AND: [
            q
              ? {
                  OR: [
                    { portName: { contains: q, mode: "insensitive" } },
                    { portCode: { contains: q.toUpperCase(), mode: "insensitive" } },
                    { country: { contains: q.toUpperCase(), mode: "insensitive" } },
                  ],
                }
              : {},
            region ? { region: region as never } : {},
          ],
        },
        orderBy: { portName: "asc" },
        take: limit,
      }),
    );

    return sendData(res, { ports });
  } catch (error) {
    return next(error);
  }
});

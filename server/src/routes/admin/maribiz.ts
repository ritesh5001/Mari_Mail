import { Router } from "express";
import { z } from "zod";
import { prisma } from "@marimail/db";
import { requireSuperAdmin } from "../../auth/middleware.js";
import { sendData, sendError } from "../../lib/http.js";
import { getOrCreateMaribizSettings, MARIBIZ_SETTINGS_ID } from "../../services/maribiz/settings.js";
import { getStats, MaribizError } from "../../services/maribiz/client.js";
import { getUsageWindow } from "../../services/maribiz/usage.js";

export const adminMaribizRouter = Router();

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  cacheTtlSeconds: z.number().int().min(60).max(86_400).optional(),
  maxResultsPerQuery: z.number().int().min(1).max(100).optional(),
});

adminMaribizRouter.get("/settings", requireSuperAdmin, async (_req, res, next) => {
  try {
    const settings = await getOrCreateMaribizSettings();
    return sendData(res, {
      ...settings,
      apiUrl: process.env.MARIBIZ_API_URL ?? null,
      apiKeyConfigured: Boolean(process.env.MARIBIZ_API_KEY),
    });
  } catch (error) {
    return next(error);
  }
});

adminMaribizRouter.patch("/settings", requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    await getOrCreateMaribizSettings();
    const updated = await prisma.maribizSettings.update({
      where: { id: MARIBIZ_SETTINGS_ID },
      data: {
        enabled: parsed.data.enabled,
        cacheTtlSeconds: parsed.data.cacheTtlSeconds,
        maxResultsPerQuery: parsed.data.maxResultsPerQuery,
      },
    });
    return sendData(res, updated);
  } catch (error) {
    return next(error);
  }
});

adminMaribizRouter.post("/test", requireSuperAdmin, async (_req, res, next) => {
  try {
    await getOrCreateMaribizSettings();
    const started = Date.now();
    try {
      const stats = await getStats();
      const latencyMs = Date.now() - started;
      const persisted = await prisma.maribizSettings.update({
        where: { id: MARIBIZ_SETTINGS_ID },
        data: {
          lastTestAt: new Date(),
          lastTestStatus: "ok",
          lastTestError: null,
          lastTestTotalRows: stats.totalRows,
          lastTestLatencyMs: latencyMs,
        },
      });
      return sendData(res, {
        ok: true,
        latencyMs,
        totalRows: stats.totalRows,
        settings: persisted,
      });
    } catch (error) {
      const latencyMs = Date.now() - started;
      const message = error instanceof MaribizError ? error.message : (error as Error).message;
      const persisted = await prisma.maribizSettings.update({
        where: { id: MARIBIZ_SETTINGS_ID },
        data: {
          lastTestAt: new Date(),
          lastTestStatus: "error",
          lastTestError: message.slice(0, 500),
          lastTestLatencyMs: latencyMs,
        },
      });
      return sendData(res, { ok: false, latencyMs, error: message, settings: persisted });
    }
  } catch (error) {
    return next(error);
  }
});

adminMaribizRouter.get("/usage", requireSuperAdmin, async (_req, res, next) => {
  try {
    const usage = await getUsageWindow();
    return sendData(res, usage);
  } catch (error) {
    return next(error);
  }
});

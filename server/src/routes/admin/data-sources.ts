import { Router } from "express";
import { z } from "zod";
import { prisma } from "@marimail/db";
import { requireSuperAdmin } from "../../auth/middleware.js";
import { sendData, sendError } from "../../lib/http.js";
import {
  getOrCreateDataSourceSettings,
  DATA_SOURCE_SETTINGS_ID,
} from "../../services/data-sources/settings.js";
import { getOrCreateMaribizSettings, MARIBIZ_SETTINGS_ID } from "../../services/maribiz/settings.js";
import {
  getOrCreateApolloSettings,
  sanitizeApolloSettings,
  APOLLO_SETTINGS_ID,
} from "../../services/apollo/settings.js";

export const adminDataSourcesRouter = Router();

const updateSchema = z.object({
  internalEnabled: z.boolean().optional(),
  maribizEnabled: z.boolean().optional(),
  apolloEnabled: z.boolean().optional(),
  persistApolloSearchRows: z.boolean().optional(),
});

adminDataSourcesRouter.get("/", requireSuperAdmin, async (_req, res, next) => {
  try {
    const [ds, maribiz, apollo] = await Promise.all([
      getOrCreateDataSourceSettings(),
      getOrCreateMaribizSettings(),
      getOrCreateApolloSettings(),
    ]);
    return sendData(res, {
      internal: { enabled: ds.internalEnabled },
      maribiz: { enabled: maribiz.enabled, hasApiKey: Boolean(process.env.MARIBIZ_API_KEY) },
      apollo: {
        enabled: apollo.enabled,
        hasApiKey: Boolean(apollo.apiKey),
        creditsPerEmailReveal: apollo.creditsPerEmailReveal,
        creditsPerPhoneReveal: apollo.creditsPerPhoneReveal,
      },
      persistApolloSearchRows: ds.persistApolloSearchRows,
    });
  } catch (error) {
    return next(error);
  }
});

adminDataSourcesRouter.patch("/", requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    await Promise.all([
      getOrCreateDataSourceSettings(),
      getOrCreateMaribizSettings(),
      getOrCreateApolloSettings(),
    ]);

    if (parsed.data.internalEnabled !== undefined || parsed.data.persistApolloSearchRows !== undefined) {
      await prisma.dataSourceSettings.update({
        where: { id: DATA_SOURCE_SETTINGS_ID },
        data: {
          ...(parsed.data.internalEnabled !== undefined ? { internalEnabled: parsed.data.internalEnabled } : {}),
          ...(parsed.data.persistApolloSearchRows !== undefined ? { persistApolloSearchRows: parsed.data.persistApolloSearchRows } : {}),
        },
      });
    }
    if (parsed.data.maribizEnabled !== undefined) {
      await prisma.maribizSettings.update({
        where: { id: MARIBIZ_SETTINGS_ID },
        data: { enabled: parsed.data.maribizEnabled },
      });
    }
    if (parsed.data.apolloEnabled !== undefined) {
      await prisma.apolloSettings.update({
        where: { id: APOLLO_SETTINGS_ID },
        data: { enabled: parsed.data.apolloEnabled },
      });
    }

    const [ds, maribiz, apollo] = await Promise.all([
      getOrCreateDataSourceSettings(),
      getOrCreateMaribizSettings(),
      getOrCreateApolloSettings(),
    ]);
    return sendData(res, {
      internal: { enabled: ds.internalEnabled },
      maribiz: { enabled: maribiz.enabled, hasApiKey: Boolean(process.env.MARIBIZ_API_KEY) },
      apollo: sanitizeApolloSettings(apollo),
      persistApolloSearchRows: ds.persistApolloSearchRows,
    });
  } catch (error) {
    return next(error);
  }
});

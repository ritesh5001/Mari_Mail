import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma } from "@marimail/db";
import { requireSuperAdmin } from "../../auth/middleware.js";
import { sendData, sendError } from "../../lib/http.js";
import { encryptJsonSecret } from "../../services/email-account.service.js";
import {
  getOrCreateApolloSettings,
  sanitizeApolloSettings,
  APOLLO_SETTINGS_ID,
} from "../../services/apollo/settings.js";
import { ApolloError, healthCheck } from "../../services/apollo/client.js";
import { getUsageWindow } from "../../services/apollo/usage.js";

export const adminApolloRouter = Router();

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  apiKey: z.string().optional(),
  apiBaseUrl: z.string().url().optional(),
  cacheTtlSeconds: z.number().int().min(60).max(86_400).optional(),
  maxResultsPerQuery: z.number().int().min(1).max(100).optional(),
  creditsPerEmailReveal: z.number().int().min(0).max(1_000).optional(),
  creditsPerPhoneReveal: z.number().int().min(0).max(1_000).optional(),
});

adminApolloRouter.get("/settings", requireSuperAdmin, async (_req, res, next) => {
  try {
    const settings = await getOrCreateApolloSettings();
    return sendData(res, sanitizeApolloSettings(settings));
  } catch (error) {
    return next(error);
  }
});

adminApolloRouter.patch("/settings", requireSuperAdmin, async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendError(res, 400, "VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
    }
    await getOrCreateApolloSettings();

    const data: Record<string, unknown> = {};
    if (parsed.data.enabled !== undefined) data.enabled = parsed.data.enabled;
    if (parsed.data.apiBaseUrl !== undefined) data.apiBaseUrl = parsed.data.apiBaseUrl;
    if (parsed.data.cacheTtlSeconds !== undefined) data.cacheTtlSeconds = parsed.data.cacheTtlSeconds;
    if (parsed.data.maxResultsPerQuery !== undefined) data.maxResultsPerQuery = parsed.data.maxResultsPerQuery;
    if (parsed.data.creditsPerEmailReveal !== undefined) data.creditsPerEmailReveal = parsed.data.creditsPerEmailReveal;
    if (parsed.data.creditsPerPhoneReveal !== undefined) data.creditsPerPhoneReveal = parsed.data.creditsPerPhoneReveal;
    if (parsed.data.apiKey !== undefined) {
      const trimmed = parsed.data.apiKey.trim();
      data.apiKey = trimmed.length ? encryptJsonSecret({ apiKey: trimmed }) : null;
    }

    const updated = await prisma.apolloSettings.update({
      where: { id: APOLLO_SETTINGS_ID },
      data,
    });
    return sendData(res, sanitizeApolloSettings(updated));
  } catch (error) {
    return next(error);
  }
});

adminApolloRouter.post("/test", requireSuperAdmin, async (_req, res, next) => {
  try {
    await getOrCreateApolloSettings();
    const started = Date.now();
    try {
      await healthCheck();
      const latencyMs = Date.now() - started;
      const persisted = await prisma.apolloSettings.update({
        where: { id: APOLLO_SETTINGS_ID },
        data: {
          lastTestAt: new Date(),
          lastTestStatus: "ok",
          lastTestError: null,
          lastTestLatencyMs: latencyMs,
        },
      });
      return sendData(res, { ok: true, latencyMs, settings: sanitizeApolloSettings(persisted) });
    } catch (error) {
      const latencyMs = Date.now() - started;
      const message = error instanceof ApolloError ? error.message : (error as Error).message;
      const persisted = await prisma.apolloSettings.update({
        where: { id: APOLLO_SETTINGS_ID },
        data: {
          lastTestAt: new Date(),
          lastTestStatus: "error",
          lastTestError: message.slice(0, 500),
          lastTestLatencyMs: latencyMs,
        },
      });
      return sendData(res, {
        ok: false,
        latencyMs,
        error: message,
        settings: sanitizeApolloSettings(persisted),
      });
    }
  } catch (error) {
    return next(error);
  }
});

adminApolloRouter.get("/usage", requireSuperAdmin, async (_req, res, next) => {
  try {
    const usage = await getUsageWindow();
    return sendData(res, usage);
  } catch (error) {
    return next(error);
  }
});

// Platform-wide Apollo credit analytics. Reads directly from the CreditLedger
// so the numbers are precise (not from the Redis usage counters, which can
// drift if the queue restarts).
adminApolloRouter.get("/credit-analytics", requireSuperAdmin, async (_req, res, next) => {
  try {
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setUTCDate(windowStart.getUTCDate() - 29);
    windowStart.setUTCHours(0, 0, 0, 0);

    const ledgerRows = await prisma.creditLedger.findMany({
      where: {
        reason: { in: ["REVEAL_EMAIL", "REVEAL_PHONE", "REFUND"] },
        // REFUND rows for Apollo carry the "apollo:" detail prefix — keeping
        // them keeps net numbers honest even if the total column ignores them.
      },
      select: {
        delta: true,
        reason: true,
        detail: true,
        workspaceId: true,
        createdAt: true,
      },
    });

    // Aggregate lifetime totals
    let emailCredits = 0;
    let phoneCredits = 0;
    let refundCredits = 0;
    let emailReveals = 0;
    let phoneReveals = 0;
    let refunds = 0;

    // Per-workspace aggregation for the "top consumers" table
    const perWorkspace = new Map<
      string,
      {
        spent: number;
        refunded: number;
        emailReveals: number;
        phoneReveals: number;
      }
    >();

    // Per-day time series (last 30 days)
    const perDay = new Map<
      string,
      { emailCredits: number; phoneCredits: number; refundCredits: number }
    >();
    for (let i = 0; i < 30; i += 1) {
      const d = new Date(windowStart);
      d.setUTCDate(d.getUTCDate() + i);
      perDay.set(d.toISOString().slice(0, 10), {
        emailCredits: 0,
        phoneCredits: 0,
        refundCredits: 0,
      });
    }

    for (const row of ledgerRows) {
      const abs = Math.abs(row.delta);
      const day = row.createdAt.toISOString().slice(0, 10);
      const dayBucket = perDay.get(day);

      const workspace = perWorkspace.get(row.workspaceId) ?? {
        spent: 0,
        refunded: 0,
        emailReveals: 0,
        phoneReveals: 0,
      };

      if (row.reason === "REVEAL_EMAIL") {
        emailCredits += abs;
        emailReveals += 1;
        workspace.spent += abs;
        workspace.emailReveals += 1;
        if (dayBucket) dayBucket.emailCredits += abs;
      } else if (row.reason === "REVEAL_PHONE") {
        phoneCredits += abs;
        phoneReveals += 1;
        workspace.spent += abs;
        workspace.phoneReveals += 1;
        if (dayBucket) dayBucket.phoneCredits += abs;
      } else if (row.reason === "REFUND" && row.detail?.startsWith("apollo:")) {
        refundCredits += abs;
        refunds += 1;
        workspace.refunded += abs;
        if (dayBucket) dayBucket.refundCredits += abs;
      }

      perWorkspace.set(row.workspaceId, workspace);
    }

    // Look up workspace metadata for the top consumers
    const topEntries = Array.from(perWorkspace.entries())
      .map(([workspaceId, agg]) => ({ workspaceId, ...agg, net: agg.spent - agg.refunded }))
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 10);

    const workspaces =
      topEntries.length > 0
        ? await prisma.workspace.findMany({
            where: { id: { in: topEntries.map((entry) => entry.workspaceId) } },
            select: { id: true, name: true, plan: true, creditBalance: true },
          })
        : [];
    const wsById = new Map(workspaces.map((w) => [w.id, w]));

    const topWorkspaces = topEntries.map((entry) => {
      const ws = wsById.get(entry.workspaceId);
      return {
        workspaceId: entry.workspaceId,
        workspaceName: ws?.name ?? "Deleted workspace",
        plan: ws?.plan ?? null,
        creditBalance: ws?.creditBalance ?? 0,
        emailReveals: entry.emailReveals,
        phoneReveals: entry.phoneReveals,
        spent: entry.spent,
        refunded: entry.refunded,
        net: entry.net,
      };
    });

    // Rough $ estimate: use the cheapest published credit-pack price to imply
    // a per-credit floor. If no packs are published, fall back to $0.
    const CENTS_PER_CREDIT = 1.9; // matches CREDIT_PACK_CATALOG 1k pack ($19 / 1000)
    const totalNet = emailCredits + phoneCredits - refundCredits;
    const costEstimateUsd = Math.round((totalNet * CENTS_PER_CREDIT) / 100);

    return sendData(res, {
      lifetime: {
        emailCredits,
        phoneCredits,
        refundCredits,
        emailReveals,
        phoneReveals,
        refunds,
        totalCreditsSpent: emailCredits + phoneCredits,
        netCredits: totalNet,
        costEstimateUsd,
      },
      series: Array.from(perDay.entries()).map(([date, values]) => ({
        date,
        ...values,
        net: values.emailCredits + values.phoneCredits - values.refundCredits,
      })),
      topWorkspaces,
    });
  } catch (error) {
    return next(error);
  }
});

// List platform-wide unlocked Apollo contacts (rows in ApolloRevealCache).
// Every Apollo person we've paid to reveal at least once. Reuse across
// workspaces is served from this table without paying Apollo again.
adminApolloRouter.get("/unlocked", requireSuperAdmin, async (req, res, next) => {
  try {
    const rawLimit = Number(req.query.limit ?? 50);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200) : 50;
    const cursor = typeof req.query.cursor === "string" && req.query.cursor.length > 0
      ? req.query.cursor
      : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const field =
      req.query.field === "email"
        ? "email"
        : req.query.field === "phone"
          ? "phone"
          : null;

    const where: Prisma.ApolloRevealCacheWhereInput = {
      AND: [
        q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { fullName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { companyName: { contains: q, mode: "insensitive" } },
                { companyDomain: { contains: q, mode: "insensitive" } },
                { title: { contains: q, mode: "insensitive" } },
                { apolloId: { equals: q } },
              ],
            }
          : {},
        field === "email" ? { email: { not: null } } : {},
        field === "phone" ? { mobilePhone: { not: null } } : {},
      ],
    };

    const [rows, total] = await Promise.all([
      prisma.apolloRevealCache.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          apolloId: true,
          firstName: true,
          lastName: true,
          fullName: true,
          title: true,
          companyName: true,
          companyDomain: true,
          email: true,
          emailStatus: true,
          mobilePhone: true,
          personLinkedinUrl: true,
          country: true,
          seniority: true,
          emailRevealedAt: true,
          phoneRevealedAt: true,
          firstRevealedWorkspaceId: true,
          reuseCount: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.apolloRevealCache.count({ where }),
    ]);

    const page = rows.slice(0, limit);
    const workspaceIds = Array.from(
      new Set(page.map((r) => r.firstRevealedWorkspaceId).filter((id): id is string => Boolean(id))),
    );
    const workspaces = workspaceIds.length
      ? await prisma.workspace.findMany({
          where: { id: { in: workspaceIds } },
          select: { id: true, name: true },
        })
      : [];
    const workspaceById = new Map(workspaces.map((w) => [w.id, w.name]));

    return sendData(res, {
      rows: page.map((r) => ({
        ...r,
        firstRevealedWorkspaceName: r.firstRevealedWorkspaceId
          ? workspaceById.get(r.firstRevealedWorkspaceId) ?? null
          : null,
      })),
      total,
      nextCursor: rows.length > limit ? page.at(-1)?.id ?? null : null,
    });
  } catch (error) {
    return next(error);
  }
});

import { Router } from "express";
import { z } from "zod";
import { prisma, type Prisma } from "@marimail/db";
import { requireSuperAdmin, type AuthedRequest } from "../../auth/middleware.js";
import { sendData, sendError } from "../../lib/http.js";
import { encryptJsonSecret } from "../../services/email-account.service.js";
import { ApolloError, testCredentials } from "../../services/apollo/client.js";

/**
 * A workspace's own Apollo API keys — "bring your own Apollo".
 *
 * Scoped to the workspace that adds them and used only for that workspace's
 * traffic: one customer's key never serves another's. A workspace on its own
 * key spends its own Apollo quota, so reveals through it are not charged
 * platform credits (see resolveApolloCredentials).
 *
 * Super-admin only, as requested — connecting a key changes who pays for every
 * subsequent lookup, which is not a per-user setting.
 */
export const adminApolloAccountRouter = Router();

const DEFAULT_BASE_URL = "https://api.apollo.io/api/v1";

const createSchema = z.object({
  label: z.string().trim().min(1).max(80),
  apiKey: z.string().trim().min(10).max(200),
  apiBaseUrl: z.string().url().optional(),
  makeDefault: z.boolean().optional(),
});

/** Never return the key. Only whether one is stored and how it last behaved. */
function sanitize(a: {
  id: string; label: string; apiBaseUrl: string; isDefault: boolean; status: string;
  lastTestAt: Date | null; lastTestError: string | null; lastTestInfo: string | null;
  createdAt: Date; createdBy?: { email: string; name: string | null } | null;
}) {
  return {
    id: a.id,
    label: a.label,
    apiBaseUrl: a.apiBaseUrl,
    isDefault: a.isDefault,
    status: a.status,
    lastTestAt: a.lastTestAt,
    lastTestError: a.lastTestError,
    lastTestInfo: a.lastTestInfo,
    createdAt: a.createdAt,
    createdBy: a.createdBy?.email ?? null,
  };
}

adminApolloAccountRouter.get("/", requireSuperAdmin, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const accounts = await prisma.workspaceApolloAccount.findMany({
      where: { workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      include: { createdBy: { select: { email: true, name: true } } },
    });
    return sendData(res, { accounts: accounts.map(sanitize) });
  } catch (error) {
    return next(error);
  }
});

/**
 * Verify a key WITHOUT storing it.
 *
 * Offered before saving so a typo'd or exhausted key is caught at the point of
 * entry rather than at 07:00 during a drip run. Costs no Apollo credits —
 * searching is free; only reveals are billed.
 */
adminApolloAccountRouter.post("/test", requireSuperAdmin, async (req, res) => {
  try {
    const input = z
      .object({ apiKey: z.string().trim().min(10), apiBaseUrl: z.string().url().optional() })
      .safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", "An API key is required to test.");
    }
    const result = await testCredentials({
      baseUrl: (input.data.apiBaseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
      apiKey: input.data.apiKey,
    });
    return sendData(res, {
      ok: true,
      message: `Key works — Apollo returned ${result.total.toLocaleString()} matching people for the test query.`,
    });
  } catch (error) {
    const message =
      error instanceof ApolloError ? error.message : (error as Error).message ?? "Test failed";
    // A rejected key is a normal outcome of pressing Test, not a server fault.
    return sendData(res, { ok: false, message });
  }
});

adminApolloAccountRouter.post("/", requireSuperAdmin, async (req, res, next) => {
  try {
    const input = createSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const baseUrl = (input.data.apiBaseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");

    // Verify before storing. A key that cannot search is worse than no key at
    // all: it would take priority over the platform key and fail every call.
    let status: "ACTIVE" | "ERROR" = "ACTIVE";
    let lastTestInfo: string | null = null;
    let lastTestError: string | null = null;
    try {
      const result = await testCredentials({ baseUrl, apiKey: input.data.apiKey });
      lastTestInfo = `${result.total.toLocaleString()} people matched the test query`;
    } catch (error) {
      status = "ERROR";
      lastTestError =
        error instanceof ApolloError ? error.message : (error as Error).message ?? "Test failed";
    }

    const existingCount = await prisma.workspaceApolloAccount.count({ where: { workspaceId } });
    // First working key becomes the default, otherwise nothing would use it.
    const makeDefault = input.data.makeDefault ?? existingCount === 0;

    const account = await prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.workspaceApolloAccount.updateMany({
          where: { workspaceId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.workspaceApolloAccount.create({
        data: {
          workspaceId,
          createdById: userId,
          label: input.data.label,
          apiKey: encryptJsonSecret({ apiKey: input.data.apiKey }) as Prisma.InputJsonValue,
          apiBaseUrl: baseUrl,
          isDefault: makeDefault,
          status,
          lastTestAt: new Date(),
          lastTestInfo,
          lastTestError,
        },
      });
    });

    return sendData(res, { account: sanitize(account), tested: status === "ACTIVE", lastTestError });
  } catch (error) {
    return next(error);
  }
});

/** Re-test a stored key, e.g. after topping the Apollo plan back up. */
adminApolloAccountRouter.post("/:id/test", requireSuperAdmin, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const account = await prisma.workspaceApolloAccount.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!account) return sendError(res, 404, "NOT_FOUND", "Apollo account not found");

    const { decryptJsonSecret } = await import("../../services/email-account.service.js");
    const decrypted = decryptJsonSecret<{ apiKey: string }>(account.apiKey);
    if (!decrypted?.apiKey) {
      return sendError(res, 400, "KEY_UNREADABLE", "Stored key could not be decrypted — re-add it.");
    }

    try {
      const result = await testCredentials({
        baseUrl: account.apiBaseUrl.replace(/\/$/, ""),
        apiKey: decrypted.apiKey,
      });
      const updated = await prisma.workspaceApolloAccount.update({
        where: { id: account.id },
        data: {
          status: "ACTIVE",
          lastTestAt: new Date(),
          lastTestError: null,
          lastTestInfo: `${result.total.toLocaleString()} people matched the test query`,
        },
      });
      return sendData(res, { account: sanitize(updated), ok: true });
    } catch (error) {
      const message =
        error instanceof ApolloError ? error.message : (error as Error).message ?? "Test failed";
      const updated = await prisma.workspaceApolloAccount.update({
        where: { id: account.id },
        data: { status: "ERROR", lastTestAt: new Date(), lastTestError: message },
      });
      return sendData(res, { account: sanitize(updated), ok: false, message });
    }
  } catch (error) {
    return next(error);
  }
});

adminApolloAccountRouter.patch("/:id", requireSuperAdmin, async (req, res, next) => {
  try {
    const input = z
      .object({ label: z.string().trim().min(1).max(80).optional(), isDefault: z.literal(true).optional() })
      .safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", "Invalid input");
    }
    const { workspaceId } = (req as AuthedRequest).auth;
    const account = await prisma.workspaceApolloAccount.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!account) return sendError(res, 404, "NOT_FOUND", "Apollo account not found");

    const updated = await prisma.$transaction(async (tx) => {
      if (input.data.isDefault) {
        // Exactly one default per workspace, or resolution order is ambiguous.
        await tx.workspaceApolloAccount.updateMany({
          where: { workspaceId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.workspaceApolloAccount.update({
        where: { id: account.id },
        data: { ...(input.data.label ? { label: input.data.label } : {}), ...(input.data.isDefault ? { isDefault: true } : {}) },
      });
    });
    return sendData(res, { account: sanitize(updated) });
  } catch (error) {
    return next(error);
  }
});

adminApolloAccountRouter.delete("/:id", requireSuperAdmin, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const account = await prisma.workspaceApolloAccount.findFirst({
      where: { id: req.params.id, workspaceId },
    });
    if (!account) return sendError(res, 404, "NOT_FOUND", "Apollo account not found");

    await prisma.workspaceApolloAccount.delete({ where: { id: account.id } });

    // Promote another key rather than leaving the workspace defaulted to
    // nothing — otherwise deleting the default silently moves every reveal
    // back onto platform credits.
    if (account.isDefault) {
      const next_ = await prisma.workspaceApolloAccount.findFirst({
        where: { workspaceId, status: { not: "ERROR" } },
        orderBy: { createdAt: "desc" },
      });
      if (next_) {
        await prisma.workspaceApolloAccount.update({
          where: { id: next_.id },
          data: { isDefault: true },
        });
      }
    }

    const remaining = await prisma.workspaceApolloAccount.count({ where: { workspaceId } });
    return sendData(res, {
      deleted: true,
      // Worth stating: with none left, lookups go back to the platform key and
      // start costing platform credits again.
      fellBackToPlatform: remaining === 0,
    });
  } catch (error) {
    return next(error);
  }
});

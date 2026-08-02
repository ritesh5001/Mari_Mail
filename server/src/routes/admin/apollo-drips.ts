import { Router } from "express";
import { z } from "zod";
import { Prisma, prisma } from "@marimail/db";
import { requireSuperAdmin } from "../../auth/middleware.js";
import type { AuthedRequest } from "../../auth/middleware.js";
import { sendData, sendError } from "../../lib/http.js";
import { runApolloDrip } from "../../services/apollo-drip.service.js";

/**
 * Admin-only scheduled Apollo reveals.
 *
 * A filter that matches thousands of people can't be added to a list in one
 * go — every reveal costs a credit. These endpoints save the filter instead
 * and let a daily job trickle `dailyLimit` people into the list. Super-admin
 * only, because it commits an ongoing, unattended credit spend.
 */
export const adminApolloDripRouter = Router();

/** Mirrors apolloPeopleSearchSchema in routes/contacts.ts. */
const filterSchema = z.object({
  includeTitles: z.array(z.string()).optional(),
  excludeTitles: z.array(z.string()).optional(),
  seniorities: z.array(z.string()).optional(),
  personLocations: z.array(z.string()).optional(),
  companyLocations: z.array(z.string()).optional(),
  employeeRanges: z.array(z.string()).optional(),
  emailStatus: z.array(z.string()).optional(),
  includeSimilarTitles: z.boolean().optional(),
  keywords: z.string().optional(),
});

const createSchema = z.object({
  listId: z.string().min(1),
  name: z.string().min(1).max(120),
  filter: filterSchema,
  // 200/day is already $200-ish of credits a day; a higher number is far more
  // likely to be a typo than an intention.
  dailyLimit: z.number().int().min(1).max(200).default(50),
  totalMatches: z.number().int().min(0).optional(),
});

function hasAnyFilter(f: z.infer<typeof filterSchema>) {
  return (
    (f.includeTitles?.length ?? 0) > 0 ||
    (f.seniorities?.length ?? 0) > 0 ||
    (f.personLocations?.length ?? 0) > 0 ||
    (f.companyLocations?.length ?? 0) > 0 ||
    (f.employeeRanges?.length ?? 0) > 0 ||
    Boolean(f.keywords)
  );
}

adminApolloDripRouter.get("/", requireSuperAdmin, async (_req, res, next) => {
  try {
    const drips = await prisma.apolloDripJob.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        list: { select: { id: true, name: true, contactCount: true } },
        createdBy: { select: { email: true, name: true } },
      },
    });
    return sendData(res, { drips });
  } catch (error) {
    return next(error);
  }
});

adminApolloDripRouter.post("/", requireSuperAdmin, async (req, res, next) => {
  try {
    const input = createSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    if (!hasAnyFilter(input.data.filter)) {
      // An unfiltered drip would page through Apollo's whole database on a
      // standing order, spending a credit per person.
      return sendError(
        res,
        400,
        "NO_FILTERS",
        "Add at least one filter — an unfiltered drip would spend credits indefinitely.",
      );
    }

    const { workspaceId, userId } = (req as AuthedRequest).auth;
    const list = await prisma.contactList.findFirst({
      where: { id: input.data.listId },
      select: { id: true, workspaceId: true },
    });
    if (!list) return sendError(res, 404, "LIST_NOT_FOUND", "List not found");

    const drip = await prisma.apolloDripJob.create({
      data: {
        workspaceId: list.workspaceId ?? workspaceId,
        listId: list.id,
        createdById: userId,
        name: input.data.name,
        filter: input.data.filter as Prisma.InputJsonValue,
        dailyLimit: input.data.dailyLimit,
        totalMatches: input.data.totalMatches ?? null,
      },
      include: { list: { select: { id: true, name: true } } },
    });
    return sendData(res, { drip });
  } catch (error) {
    return next(error);
  }
});

adminApolloDripRouter.patch("/:id", requireSuperAdmin, async (req, res, next) => {
  try {
    const input = z
      .object({
        status: z.enum(["ACTIVE", "PAUSED", "COMPLETED"]).optional(),
        dailyLimit: z.number().int().min(1).max(200).optional(),
        name: z.string().min(1).max(120).optional(),
      })
      .safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const existing = await prisma.apolloDripJob.findUnique({ where: { id: req.params.id } });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Drip not found");

    const drip = await prisma.apolloDripJob.update({
      where: { id: req.params.id },
      data: {
        ...input.data,
        // Re-activating after a credit stall should clear the stale reason so
        // the row doesn't keep reporting a problem that has been dealt with.
        ...(input.data.status === "ACTIVE" ? { lastError: null } : {}),
      },
    });
    return sendData(res, { drip });
  } catch (error) {
    return next(error);
  }
});

adminApolloDripRouter.delete("/:id", requireSuperAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.apolloDripJob.findUnique({ where: { id: req.params.id } });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Drip not found");
    await prisma.apolloDripJob.delete({ where: { id: req.params.id } });
    return sendData(res, { deleted: true });
  } catch (error) {
    return next(error);
  }
});

/**
 * Run one drip immediately instead of waiting for 07:00 UTC — for verifying a
 * new filter actually returns people before leaving it on a standing order.
 * It consumes the same daily allowance, so it can't be used to double-spend.
 */
adminApolloDripRouter.post("/:id/run", requireSuperAdmin, async (req, res, next) => {
  try {
    const existing = await prisma.apolloDripJob.findUnique({ where: { id: req.params.id } });
    if (!existing) return sendError(res, 404, "NOT_FOUND", "Drip not found");
    if (existing.status !== "ACTIVE") {
      return sendError(res, 400, "NOT_ACTIVE", `Drip is ${existing.status} — resume it first.`);
    }
    const result = await runApolloDrip(existing.id);
    return sendData(res, result);
  } catch (error) {
    return next(error);
  }
});

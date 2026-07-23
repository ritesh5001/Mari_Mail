import { Router } from "express";
import { z } from "zod";
import { prisma } from "@marimail/db";
import { requireAuth, type AuthedRequest } from "../auth/middleware.js";
import { issueTokenPair } from "../auth/jwt.js";
import { setAuthCookies } from "../lib/cookies.js";
import { sendData, sendError } from "../lib/http.js";
import { getToken, setToken } from "../services/token-store.js";

export const workspaceRouter = Router();

const switchSchema = z.object({
  workspaceId: z.string().min(1),
});

const targetCountrySchema = z.object({
  targetPortCountry: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .nullable(),
});

const sendGapDefaultsSchema = z
  .object({
    defaultSendGapMinSeconds: z.number().int().min(0).max(86_400),
    defaultSendGapMaxSeconds: z.number().int().min(0).max(86_400),
  })
  .refine((v) => v.defaultSendGapMaxSeconds >= v.defaultSendGapMinSeconds, {
    message: "Maximum gap must be greater than or equal to the minimum gap",
    path: ["defaultSendGapMaxSeconds"],
  });

const PORT_COUNTRIES_CACHE_KEY = "workspace:port-countries:v1";
const PORT_COUNTRIES_TTL_SECONDS = 60 * 60;

workspaceRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthedRequest).auth;
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });

    return sendData(
      res,
      memberships.map((membership) => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
        role: membership.role,
        timezone: membership.workspace.timezone,
        onboardedAt: membership.workspace.onboardedAt,
      })),
    );
  } catch (error) {
    return next(error);
  }
});

workspaceRouter.post("/switch", requireAuth, async (req, res, next) => {
  try {
    const input = switchSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { userId } = (req as AuthedRequest).auth;
    const membership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: input.data.workspaceId,
        },
      },
    });

    if (!membership) {
      return sendError(res, 403, "WORKSPACE_FORBIDDEN", "Workspace access denied");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { defaultWorkspaceId: input.data.workspaceId },
    });

    const tokens = await issueTokenPair(userId, input.data.workspaceId);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    return sendData(res, { workspaceId: input.data.workspaceId });
  } catch (error) {
    return next(error);
  }
});

/**
 * Distinct country list derived from `Port`. Powers the onboarding picker
 * and the in-page country banner. Cached in Redis (or in-memory via the
 * token store) so the heavy distinct query only runs once per hour.
 */
async function listPortCountries() {
  const cached = await getToken(PORT_COUNTRIES_CACHE_KEY);
  if (cached) return JSON.parse(cached) as Array<{ country: string; countryName: string }>;
  const rows = await prisma.port.findMany({
    distinct: ["country"],
    select: { country: true, countryName: true },
    orderBy: { countryName: "asc" },
  });
  const countries = rows
    .map((row) => ({ country: row.country, countryName: row.countryName }))
    .filter((row) => row.country && row.countryName);
  await setToken(
    PORT_COUNTRIES_CACHE_KEY,
    JSON.stringify(countries),
    PORT_COUNTRIES_TTL_SECONDS,
  ).catch(() => undefined);
  return countries;
}

workspaceRouter.get("/port-countries", requireAuth, async (_req, res, next) => {
  try {
    return sendData(res, await listPortCountries());
  } catch (error) {
    return next(error);
  }
});

/**
 * Unauthenticated variant used by the registration form to populate the
 * Target country dropdown. Same data, same cache — no session needed since
 * the list is purely public reference data (country codes and display names).
 */
workspaceRouter.get("/port-countries/public", async (_req, res, next) => {
  try {
    return sendData(res, await listPortCountries());
  } catch (error) {
    return next(error);
  }
});

/**
 * Returns the list of ports for one or more countries. Used by the
 * Vessel filter panel's "Destination ports" multi-select, which only
 * unlocks after the user has picked at least one country.
 *
 * `?countries=TG,SG` → all Togolese + Singaporean ports. Empty `countries`
 * falls back to the caller's workspace target country; if that's also
 * unset, returns `[]` to avoid loading every port worldwide.
 */
workspaceRouter.get("/ports", requireAuth, async (req, res, next) => {
  try {
    const raw = typeof req.query.countries === "string" ? req.query.countries : "";
    const requested = raw
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter((c) => /^[A-Z]{2}$/.test(c));

    let countries = requested;
    if (countries.length === 0) {
      const { workspaceId } = (req as AuthedRequest).auth;
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { targetPortCountry: true },
      });
      if (workspace?.targetPortCountry) countries = [workspace.targetPortCountry];
    }
    if (countries.length === 0) return sendData(res, []);

    const cacheKey = `workspace:ports:${countries.slice().sort().join(",")}`;
    const cached = await getToken(cacheKey);
    if (cached) {
      return sendData(res, JSON.parse(cached));
    }
    const ports = await prisma.port.findMany({
      where: { country: { in: countries } },
      select: { portCode: true, portName: true, country: true, countryName: true },
      orderBy: [{ countryName: "asc" }, { portName: "asc" }],
      take: 2000,
    });
    await setToken(cacheKey, JSON.stringify(ports), PORT_COUNTRIES_TTL_SECONDS).catch(() => undefined);
    return sendData(res, ports);
  } catch (error) {
    return next(error);
  }
});

/**
 * Lets a workspace OWNER or ADMIN update their workspace's target port
 * country (or clear it). Single source of truth — the onboarding route
 * writes the same column. Reads come off the session payload.
 */
workspaceRouter.patch("/me/target-country", requireAuth, async (req, res, next) => {
  try {
    const input = targetCountrySchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }

    const { userId, workspaceId } = (req as AuthedRequest).auth;
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
      return sendError(res, 403, "WORKSPACE_FORBIDDEN", "Only workspace owners or admins can change this setting");
    }

    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { targetPortCountry: input.data.targetPortCountry },
      select: { id: true, targetPortCountry: true },
    });
    return sendData(res, workspace);
  } catch (error) {
    return next(error);
  }
});

// Default random send-gap range applied to every new campaign in this
// workspace. Read for the settings form; write requires owner/admin.
workspaceRouter.get("/me/send-gap-defaults", requireAuth, async (req, res, next) => {
  try {
    const { workspaceId } = (req as AuthedRequest).auth;
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { defaultSendGapMinSeconds: true, defaultSendGapMaxSeconds: true },
    });
    if (!workspace) return sendError(res, 404, "WORKSPACE_NOT_FOUND", "Workspace not found");
    return sendData(res, workspace);
  } catch (error) {
    return next(error);
  }
});

workspaceRouter.patch("/me/send-gap-defaults", requireAuth, async (req, res, next) => {
  try {
    const input = sendGapDefaultsSchema.safeParse(req.body);
    if (!input.success) {
      return sendError(res, 400, "VALIDATION_ERROR", input.error.issues[0]?.message ?? "Invalid input");
    }
    const { userId, workspaceId } = (req as AuthedRequest).auth;
    const membership = await prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    });
    if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
      return sendError(res, 403, "WORKSPACE_FORBIDDEN", "Only workspace owners or admins can change this setting");
    }
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        defaultSendGapMinSeconds: input.data.defaultSendGapMinSeconds,
        defaultSendGapMaxSeconds: input.data.defaultSendGapMaxSeconds,
      },
      select: { defaultSendGapMinSeconds: true, defaultSendGapMaxSeconds: true },
    });
    return sendData(res, workspace);
  } catch (error) {
    return next(error);
  }
});

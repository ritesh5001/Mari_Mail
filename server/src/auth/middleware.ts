import type { NextFunction, Request, Response } from "express";
import { prisma } from "@marimail/db";
import { accessCookieName } from "../lib/cookies.js";
import { sendError } from "../lib/http.js";
import { verifyAccessToken } from "./jwt.js";

export type AuthedRequest = Request & {
  auth: {
    userId: string;
    workspaceId: string;
    /** Sourced from the ban-check lookup below, so it costs no extra query. */
    isSuperAdmin: boolean;
  };
};

type AccountState = { bannedAt: Date | null; isSuperAdmin: boolean };

/**
 * Short-lived cache of the ban/role check that every authenticated request
 * performs.
 *
 * Both middlewares below re-read the same two columns from Postgres on EVERY
 * request — a Neon round trip in front of every dashboard load, every filter
 * change, every poll, before any real work starts. That is the single biggest
 * fixed latency cost in the API.
 *
 * In-process rather than Redis on purpose: Upstash bills per command, so
 * caching there would trade a Postgres round trip for a Redis one and save
 * nothing (the queue's request budget is already tight enough to have needed a
 * quota guard).
 *
 * The trade is bounded and small. A ban currently takes effect within the
 * access token's 15-minute TTL at worst; with this it takes effect within
 * TTL_MS. Nothing writes `bannedAt` in application code — bans are applied
 * directly in the database — so there is no invalidation hook to miss, and no
 * path where a stale entry outlives its TTL.
 */
const ACCOUNT_CACHE_TTL_MS = 30_000;
/** Bounds memory on a long-running process; far above any real concurrent-user count. */
const ACCOUNT_CACHE_MAX = 10_000;
const accountCache = new Map<string, { state: AccountState; expiresAt: number }>();

async function loadAccountState(userId: string): Promise<AccountState | null> {
  const now = Date.now();
  const hit = accountCache.get(userId);
  if (hit && hit.expiresAt > now) return hit.state;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannedAt: true, isSuperAdmin: true },
  });
  if (!user) {
    // Negative results are NOT cached: a deleted user should stop
    // authenticating immediately, and there is no volume argument for caching
    // a case that only occurs once per stale token.
    accountCache.delete(userId);
    return null;
  }

  if (accountCache.size >= ACCOUNT_CACHE_MAX) {
    // Cheap eviction: drop the oldest insertion. Map preserves insertion order,
    // so the first key is the least recently added.
    const oldest = accountCache.keys().next().value;
    if (oldest !== undefined) accountCache.delete(oldest);
  }
  const state: AccountState = { bannedAt: user.bannedAt, isSuperAdmin: user.isSuperAdmin };
  accountCache.set(userId, { state, expiresAt: now + ACCOUNT_CACHE_TTL_MS });
  return state;
}

/** Drops a cached entry so a change takes effect on the next request. */
export function invalidateAccountState(userId: string) {
  accountCache.delete(userId);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const token = bearer ?? req.cookies?.[accessCookieName];

  if (!token) {
    return sendError(res, 401, "UNAUTHENTICATED", "Authentication required");
  }

  try {
    const payload = verifyAccessToken(token);

    // A ban must take effect promptly. The access token is a signed JWT valid
    // for its full 15-minute TTL, so without this check a banned or deleted
    // user kept working until it expired. Served from a 30s cache — see
    // `loadAccountState`.
    const user = await loadAccountState(payload.sub);
    if (!user) {
      return sendError(res, 401, "INVALID_SESSION", "Session expired");
    }
    if (user.bannedAt) {
      return sendError(res, 403, "ACCOUNT_SUSPENDED", "This account has been suspended.");
    }

    (req as AuthedRequest).auth = {
      userId: payload.sub,
      workspaceId: payload.workspaceId,
      isSuperAdmin: user.isSuperAdmin,
    };
    return next();
  } catch {
    return sendError(res, 401, "INVALID_SESSION", "Session expired");
  }
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const token = bearer ?? req.cookies?.[accessCookieName];

  if (!token) {
    return sendError(res, 401, "UNAUTHENTICATED", "Authentication required");
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await loadAccountState(payload.sub);

    if (user?.bannedAt) {
      return sendError(res, 403, "ACCOUNT_SUSPENDED", "This account has been suspended.");
    }
    if (!user?.isSuperAdmin) {
      return sendError(res, 403, "FORBIDDEN", "Super admin access required");
    }

    (req as AuthedRequest).auth = {
      userId: payload.sub,
      workspaceId: payload.workspaceId,
      isSuperAdmin: true,
    };
    return next();
  } catch {
    return sendError(res, 401, "INVALID_SESSION", "Session expired");
  }
}

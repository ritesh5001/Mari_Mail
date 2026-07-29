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

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const token = bearer ?? req.cookies?.[accessCookieName];

  if (!token) {
    return sendError(res, 401, "UNAUTHENTICATED", "Authentication required");
  }

  try {
    const payload = verifyAccessToken(token);

    // A ban must take effect immediately. The access token is a signed JWT that
    // stays valid for its full 15-minute TTL, so without this check a banned or
    // deleted user kept working until it expired.
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { bannedAt: true, isSuperAdmin: true },
    });
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
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isSuperAdmin: true, bannedAt: true },
    });

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

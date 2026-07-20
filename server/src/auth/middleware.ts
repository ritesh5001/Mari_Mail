import type { NextFunction, Request, Response } from "express";
import { prisma } from "@marimail/db";
import { accessCookieName } from "../lib/cookies.js";
import { sendError } from "../lib/http.js";
import { verifyAccessToken } from "./jwt.js";

export type AuthedRequest = Request & {
  auth: {
    userId: string;
    workspaceId: string;
  };
};

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const bearer = req.header("authorization")?.replace(/^Bearer\s+/i, "");
  const token = bearer ?? req.cookies?.[accessCookieName];

  if (!token) {
    return sendError(res, 401, "UNAUTHENTICATED", "Authentication required");
  }

  try {
    const payload = verifyAccessToken(token);
    (req as AuthedRequest).auth = {
      userId: payload.sub,
      workspaceId: payload.workspaceId,
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
      select: { id: true, isSuperAdmin: true },
    });

    if (!user?.isSuperAdmin) {
      return sendError(res, 403, "FORBIDDEN", "Super admin access required");
    }

    (req as AuthedRequest).auth = {
      userId: payload.sub,
      workspaceId: payload.workspaceId,
    };
    return next();
  } catch {
    return sendError(res, 401, "INVALID_SESSION", "Session expired");
  }
}

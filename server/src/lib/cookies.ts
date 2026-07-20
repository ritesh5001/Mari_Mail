import type { Response } from "express";

const isProduction = process.env.NODE_ENV === "production";

export const accessCookieName = "marimail_access";
export const refreshCookieName = "marimail_refresh";

const crossSiteCookie = {
  sameSite: isProduction ? ("none" as const) : ("lax" as const),
  secure: isProduction,
};

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string, remember = true) {
  res.cookie(accessCookieName, accessToken, {
    httpOnly: true,
    ...crossSiteCookie,
    maxAge: 15 * 60 * 1000,
    path: "/",
  });

  res.cookie(refreshCookieName, refreshToken, {
    httpOnly: true,
    ...crossSiteCookie,
    maxAge: remember ? 7 * 24 * 60 * 60 * 1000 : undefined,
    path: "/",
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(accessCookieName, { path: "/", ...crossSiteCookie });
  res.clearCookie(refreshCookieName, { path: "/", ...crossSiteCookie });
}

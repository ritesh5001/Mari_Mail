import type { NextFunction, Request, Response } from "express";
import { sendError } from "../lib/http.js";

/**
 * Origin-based CSRF protection for state-changing requests.
 *
 * Why this is needed:
 *  - Auth cookies are issued with `SameSite=None` (the web app and the API sit
 *    on different origins), so the browser attaches them to cross-site requests.
 *  - `express.urlencoded()` is mounted globally, so every POST also accepts
 *    `application/x-www-form-urlencoded`.
 *
 * That combination is classic CSRF: a form on evil.com can POST to this API,
 * the browser attaches the session cookies, and the mutation succeeds. CORS
 * does NOT stop it — a form post is a "simple request", so there's no preflight,
 * and the attacker never needs to read the response.
 *
 * The fix is to verify the request actually originated from an allowed site.
 * `Origin` is set by the browser on all cross-origin requests (including form
 * posts) and cannot be forged by page JavaScript.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function normalize(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function csrfGuard(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins.map((o) => normalize(o)).filter((o): o is string => !!o));

  return function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = normalize(req.header("origin"));
    // Fall back to Referer: a few browsers omit Origin on same-origin posts.
    const referer = normalize(req.header("referer"));
    const source = origin ?? referer;

    if (!source) {
      // No Origin AND no Referer means it isn't a browser-initiated request —
      // server-to-server callers (webhooks, cron, curl) never carry these, and
      // they authenticate with a bearer token rather than an ambient cookie.
      // A browser cannot suppress both on a cross-site POST.
      const usesCookieAuth = Boolean(req.headers.cookie);
      if (!usesCookieAuth) return next();
      return sendError(res, 403, "CSRF_ORIGIN_MISSING", "Request origin could not be verified.");
    }

    if (!allowed.has(source)) {
      return sendError(res, 403, "CSRF_ORIGIN_REJECTED", "Request origin is not allowed.");
    }

    return next();
  };
}

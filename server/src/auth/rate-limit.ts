import type { NextFunction, Request, Response } from "express";
import { incrementToken } from "../services/token-store.js";
import { sendError } from "../lib/http.js";

/**
 * Fixed-window rate limiting for authentication endpoints.
 *
 * Built on the existing Redis-backed token store (with in-memory fallback)
 * rather than a new dependency, so it survives restarts and is shared across
 * every API instance — an in-process limiter would be trivially bypassed by
 * spreading attempts across workers.
 *
 * Before this, /auth/login had no throttle at all: an attacker could grind
 * passwords at whatever rate the box would serve.
 */

/**
 * Client IP. `req.ip` honours `trust proxy`, which must be enabled behind
 * nginx or every request appears to come from 127.0.0.1 and the whole limiter
 * collapses into one shared bucket.
 */
function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

type Options = {
  /** Bucket name, so different endpoints don't share a counter. */
  name: string;
  /** Window length in seconds. */
  windowSeconds: number;
  /** Attempts allowed per window. */
  max: number;
  /**
   * Optional second dimension (usually the submitted email), so one attacker
   * can't lock out a victim by burning the victim's per-account budget from a
   * different IP — and so a botnet can't spread a single-account attack across
   * many IPs undetected.
   */
  keyFromBody?: (req: Request) => string | null;
};

export function rateLimit({ name, windowSeconds, max, keyFromBody }: Options) {
  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
      const buckets = [`rl:${name}:ip:${clientIp(req)}`];
      const extra = keyFromBody?.(req);
      if (extra) buckets.push(`rl:${name}:id:${extra.toLowerCase()}`);

      const counts = await Promise.all(
        buckets.map((bucket) => incrementToken(bucket, windowSeconds)),
      );

      if (counts.some((count) => count > max)) {
        res.setHeader("Retry-After", String(windowSeconds));
        return sendError(
          res,
          429,
          "RATE_LIMITED",
          "Too many attempts. Please wait a few minutes and try again.",
        );
      }
      return next();
    } catch {
      // Never let a limiter outage lock every user out of the product.
      return next();
    }
  };
}

/** Sign-in: strict. Throttled per IP *and* per email address. */
export const loginRateLimit = rateLimit({
  name: "login",
  windowSeconds: 15 * 60,
  max: 10,
  keyFromBody: (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return typeof email === "string" ? email.trim() : null;
  },
});

/** Account creation — abuse/spam control. */
export const registerRateLimit = rateLimit({
  name: "register",
  windowSeconds: 60 * 60,
  max: 5,
});

/** Reset requests: prevents mail-bombing an address. */
export const passwordResetRateLimit = rateLimit({
  name: "forgot-password",
  windowSeconds: 60 * 60,
  max: 5,
  keyFromBody: (req) => {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    return typeof email === "string" ? email.trim() : null;
  },
});

/** Guessing a reset token is a brute-force target in its own right. */
export const resetTokenRateLimit = rateLimit({
  name: "reset-password",
  windowSeconds: 15 * 60,
  max: 10,
});

/** Refresh should be rare; a flood means token guessing or a broken client. */
export const refreshRateLimit = rateLimit({
  name: "refresh",
  windowSeconds: 15 * 60,
  max: 60,
});

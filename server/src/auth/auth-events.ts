import type { Request } from "express";
import { prisma, type AuthEventType } from "@marimail/db";
import { getToken, incrementToken, setToken, deleteToken } from "../services/token-store.js";

/**
 * Authentication audit trail + progressive lockout.
 *
 * Rate limiting throttles a window; lockout escalates against repeated failure
 * on a single account, which is what actually stops a slow, distributed
 * password-spray. The audit log exists so "was this account accessed, and from
 * where?" is answerable after an incident — previously there was no record of
 * any auth event at all.
 */

export function requestContext(req: Request) {
  return {
    ipAddress: req.ip ?? req.socket.remoteAddress ?? null,
    // Cap length — User-Agent is attacker-controlled and shouldn't be able to
    // bloat a row.
    userAgent: (req.header("user-agent") ?? "").slice(0, 400) || null,
  };
}

/** Record an auth event. Never throws — auditing must not break the flow. */
export async function recordAuthEvent(input: {
  type: AuthEventType;
  req: Request;
  userId?: string | null;
  email?: string | null;
  detail?: string | null;
}) {
  try {
    const { ipAddress, userAgent } = requestContext(input.req);
    await prisma.authEvent.create({
      data: {
        type: input.type,
        userId: input.userId ?? null,
        email: input.email?.toLowerCase() ?? null,
        ipAddress,
        userAgent,
        detail: input.detail ?? null,
      },
    });
  } catch (err) {
    console.warn(`[auth-audit] failed to record ${input.type}: ${(err as Error).message}`);
  }
}

// --- Progressive lockout -----------------------------------------------------

/** Failures → lock duration. Escalates so a persistent attacker gets slower. */
const LOCKOUT_TIERS: Array<{ failures: number; seconds: number }> = [
  { failures: 5, seconds: 15 * 60 },
  { failures: 10, seconds: 60 * 60 },
  { failures: 20, seconds: 24 * 60 * 60 },
];

const FAIL_WINDOW_SECONDS = 24 * 60 * 60;

function failKey(email: string) {
  return `authfail:${email.toLowerCase()}`;
}
function lockKey(email: string) {
  return `authlock:${email.toLowerCase()}`;
}

/** Seconds remaining on a lock, or 0 when the account is not locked. */
export async function lockoutRemaining(email: string): Promise<number> {
  const until = await getToken(lockKey(email));
  if (!until) return 0;
  const remaining = Math.ceil((Number(until) - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Record a failed attempt and apply a lock once a tier is crossed.
 * Returns the lock duration applied, or 0.
 */
export async function registerAuthFailure(email: string): Promise<number> {
  const failures = await incrementToken(failKey(email), FAIL_WINDOW_SECONDS);
  // Highest tier whose threshold we've just reached.
  const tier = [...LOCKOUT_TIERS].reverse().find((t) => failures >= t.failures);
  if (!tier) return 0;
  await setToken(lockKey(email), String(Date.now() + tier.seconds * 1000), tier.seconds);
  return tier.seconds;
}

/** Clear failure/lock state — called on a successful sign-in. */
export async function clearAuthFailures(email: string) {
  await Promise.all([deleteToken(failKey(email)), deleteToken(lockKey(email))]);
}

// --- Breached-password check -------------------------------------------------

/**
 * HaveIBeenPwned range API (k-anonymity): we send only the first 5 characters
 * of the SHA-1 hash, never the password or the full hash. Returns how many
 * breaches the password appears in; 0 means unseen.
 *
 * Fails OPEN — if HIBP is unreachable we allow the password rather than block
 * a signup on a third-party outage.
 */
export async function breachedPasswordCount(password: string): Promise<number> {
  try {
    const { createHash } = await import("node:crypto");
    const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return 0;

    const body = await res.text();
    for (const line of body.split("\n")) {
      const [hashSuffix, count] = line.trim().split(":");
      if (hashSuffix === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return 0; // fail open
  }
}

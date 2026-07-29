import type { Request } from "express";

/**
 * CAPTCHA verification for public, unauthenticated endpoints.
 *
 * Default provider is Cloudflare Turnstile (free, unlimited, usually invisible,
 * no third-party ad tracking). The provider is behind this one module so
 * swapping to hCaptcha or reCAPTCHA is a URL + env change, not a refactor —
 * all three expose the same "POST secret+response, get { success }" contract.
 *
 * Unconfigured = disabled. Without this, adding the code would instantly break
 * signup on every environment that hasn't set the keys yet (local dev, staging,
 * and the live box until its .env is updated).
 */

type Provider = "turnstile" | "hcaptcha" | "recaptcha";

const VERIFY_URLS: Record<Provider, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  hcaptcha: "https://api.hcaptcha.com/siteverify",
  recaptcha: "https://www.google.com/recaptcha/api/siteverify",
};

function provider(): Provider {
  const raw = (process.env.CAPTCHA_PROVIDER ?? "turnstile").toLowerCase();
  return raw === "hcaptcha" || raw === "recaptcha" ? raw : "turnstile";
}

function secret(): string | null {
  return process.env.CAPTCHA_SECRET_KEY?.trim() || null;
}

/** True when a secret is configured — callers use this to require a token. */
export function captchaEnabled(): boolean {
  return Boolean(secret());
}

export type CaptchaResult =
  | { ok: true }
  | { ok: false; reason: "missing_token" | "rejected" | "unavailable"; detail?: string };

/**
 * Verify a client-submitted CAPTCHA token.
 *
 * Fails CLOSED: a provider outage blocks registration rather than silently
 * waving bots through. That's the right trade for a signup form that hands out
 * trial credits — a brief inability to register is recoverable, a flood of
 * fake accounts is not. Set CAPTCHA_FAIL_OPEN=true to invert this.
 */
export async function verifyCaptcha(token: unknown, req: Request): Promise<CaptchaResult> {
  const key = secret();
  if (!key) return { ok: true }; // not configured → disabled

  if (typeof token !== "string" || token.trim().length === 0) {
    return { ok: false, reason: "missing_token" };
  }

  const body = new URLSearchParams({ secret: key, response: token.trim() });
  // Binding the solve to the client IP makes a stolen token harder to replay.
  const ip = req.ip ?? req.socket.remoteAddress;
  if (ip) body.set("remoteip", ip);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(VERIFY_URLS[provider()], {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      return failure("unavailable", `verifier returned ${response.status}`);
    }

    const payload = (await response.json()) as {
      success?: boolean;
      "error-codes"?: string[];
    };
    if (payload.success) return { ok: true };

    return {
      ok: false,
      reason: "rejected",
      detail: payload["error-codes"]?.join(",") ?? "no reason given",
    };
  } catch (error) {
    return failure("unavailable", (error as Error).message);
  }
}

function failure(reason: "unavailable", detail: string): CaptchaResult {
  const failOpen = process.env.CAPTCHA_FAIL_OPEN === "true";
  console.error(`[captcha] verification unavailable (${detail}) — ${failOpen ? "allowing" : "blocking"}`);
  return failOpen ? { ok: true } : { ok: false, reason, detail };
}

/** User-facing message for a failed check. Never leaks provider internals. */
export function captchaErrorMessage(result: Extract<CaptchaResult, { ok: false }>): string {
  if (result.reason === "unavailable") {
    return "We couldn't complete the security check. Please try again in a moment.";
  }
  return "Security check failed. Please complete the challenge and try again.";
}

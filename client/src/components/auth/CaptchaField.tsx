"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/client-api";

/**
 * CAPTCHA widget for public forms.
 *
 * Config comes from the API (`/auth/captcha-config`) rather than a client env
 * var, so the widget can never drift out of sync with server enforcement — a
 * server holding a secret while the client renders nothing would block every
 * signup.
 *
 * Renders nothing when CAPTCHA is disabled, so local dev and any environment
 * without keys behaves exactly as before.
 */

type CaptchaConfig = { enabled: boolean; provider: string; siteKey: string | null };

const SCRIPTS: Record<string, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
  hcaptcha: "https://js.hcaptcha.com/1/api.js?render=explicit",
  recaptcha: "https://www.google.com/recaptcha/api.js?render=explicit",
};

// Turnstile / hCaptcha / reCAPTCHA all expose the same explicit-render shape.
type WidgetApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: WidgetApi;
    hcaptcha?: WidgetApi;
    grecaptcha?: WidgetApi;
  }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Failed to load the security check"));
    document.head.appendChild(el);
  });
}

export function CaptchaField({
  onToken,
  className,
}: {
  /** Fires with the solve token, or null when it expires / is reset. */
  onToken: (token: string | null) => void;
  className?: string;
}) {
  const [config, setConfig] = useState<CaptchaConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Keep the latest callback without re-running the render effect.
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiUrl}/auth/captcha-config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { data?: CaptchaConfig } | null) => {
        if (!cancelled) setConfig(payload?.data ?? { enabled: false, provider: "turnstile", siteKey: null });
      })
      .catch(() => {
        // Can't reach config → assume disabled rather than blocking signup on
        // a transient network error. The server still enforces independently.
        if (!cancelled) setConfig({ enabled: false, provider: "turnstile", siteKey: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const api = useCallback((): WidgetApi | undefined => {
    if (!config) return undefined;
    if (config.provider === "hcaptcha") return window.hcaptcha;
    if (config.provider === "recaptcha") return window.grecaptcha;
    return window.turnstile;
  }, [config]);

  useEffect(() => {
    if (!config?.enabled || !config.siteKey || !containerRef.current) return;
    if (widgetIdRef.current) return; // already rendered

    let cancelled = false;
    const src = SCRIPTS[config.provider] ?? SCRIPTS.turnstile;

    loadScript(src)
      .then(() => {
        // The script sets its global asynchronously; poll briefly for it.
        const start = Date.now();
        const tick = () => {
          if (cancelled) return;
          const widget = api();
          if (widget?.render && containerRef.current && !widgetIdRef.current) {
            widgetIdRef.current = widget.render(containerRef.current, {
              sitekey: config.siteKey,
              callback: (token: string) => onTokenRef.current(token),
              "expired-callback": () => onTokenRef.current(null),
              "error-callback": () => onTokenRef.current(null),
              theme: "auto",
            });
            return;
          }
          if (Date.now() - start < 10000) setTimeout(tick, 100);
          else setError("Security check didn't load. Please refresh and try again.");
        };
        tick();
      })
      .catch(() => {
        if (!cancelled) setError("Security check didn't load. Please refresh and try again.");
      });

    return () => {
      cancelled = true;
    };
  }, [config, api]);

  if (!config?.enabled) return null;

  return (
    <div className={className}>
      <div ref={containerRef} />
      {error ? <p className="mt-1.5 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

/** Imperatively reset the widget after a failed submit so a fresh token is issued. */
export function resetCaptcha(provider = "turnstile") {
  const widget =
    provider === "hcaptcha" ? window.hcaptcha : provider === "recaptcha" ? window.grecaptcha : window.turnstile;
  widget?.reset?.();
}

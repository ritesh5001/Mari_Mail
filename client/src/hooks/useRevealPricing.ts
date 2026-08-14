"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/browser-fetch";

export type RevealPricing = { email: number; phone: number };

/**
 * What a reveal costs, straight from the server.
 *
 * Both prices are admin-configurable and they are NOT the same — an email is a
 * single credit, a phone number is priced far higher because it costs the
 * provider far more. Every "1 credit" label written into the UI was therefore
 * a promise the server didn't keep the moment the price moved, so the labels
 * read from here instead.
 *
 * The defaults match the schema defaults, so a failed or in-flight fetch shows
 * the right numbers for a stock deployment rather than a zero or a blank.
 */
export function useRevealPricing(): RevealPricing {
  const [pricing, setPricing] = useState<RevealPricing>({ email: 1, phone: 20 });

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/billing/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { data?: { revealPricing?: Partial<RevealPricing> } } | null) => {
        const next = payload?.data?.revealPricing;
        if (cancelled || !next) return;
        setPricing({ email: next.email ?? 1, phone: next.phone ?? 20 });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return pricing;
}

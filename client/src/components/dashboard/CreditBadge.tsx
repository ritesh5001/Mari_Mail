"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

/**
 * Credit balance in the header, always in view.
 *
 * Credits are spent by actions scattered across the app — revealing an email,
 * a scheduled drip run — and until now the only way to know the balance was to
 * open Billing. Running out then showed up as a failed reveal rather than as a
 * number that had been visibly falling.
 *
 * Refetches whenever the route changes and on a slow interval, because the
 * balance moves while the user is sitting on one page revealing contacts.
 */
export function CreditBadge() {
  const pathname = usePathname();
  const [balance, setBalance] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch("/api/billing/me");
      if (!res.ok) return;
      const payload = (await res.json()) as {
        data?: { workspace?: { creditBalance?: number } };
      };
      const value = payload.data?.workspace?.creditBalance;
      if (typeof value === "number") setBalance(value);
    } catch {
      // A header ornament must never break the page it sits in.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, pathname]);

  useEffect(() => {
    const timer = setInterval(() => void load(), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  // Render nothing until the first read lands, rather than flashing a zero
  // that reads as "you have no credits".
  if (balance === null) return null;

  const empty = balance <= 0;
  const low = !empty && balance < 50;

  return (
    <Link
      href="/dashboard/billing"
      title={
        empty
          ? "You're out of credits — reveals and scheduled runs will stop. Click to top up."
          : `${balance.toLocaleString()} credits remaining. Click to manage billing.`
      }
      className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium shadow-sm transition-colors ${
        empty
          ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200"
          : low
            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200"
            : "border-slate-200 bg-white text-slate-700 hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:bg-white/[0.08] dark:hover:text-white"
      }`}
    >
      <Coins className="h-4 w-4 shrink-0" />
      <span className="tabular-nums">{balance.toLocaleString()}</span>
      {/* The word is dropped on narrow screens; the coin icon carries it. */}
      <span className="hidden sm:inline">credits</span>
    </Link>
  );
}

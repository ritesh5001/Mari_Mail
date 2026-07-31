"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { startRazorpayCheckout, type CheckoutTarget } from "@/lib/razorpay-checkout";
import { cn } from "@/lib/cn";

/**
 * Runs one purchase through Razorpay Checkout.
 *
 * Stays in its pending state for the whole flow — including while the hosted
 * sheet is open — so a customer can't fire a second order by clicking again
 * behind the modal.
 */
export function CheckoutButton({
  target,
  label,
  user,
  variant = "primary",
  disabled,
  className,
}: {
  target: CheckoutTarget;
  label: string;
  user: { name?: string; email?: string };
  variant?: "primary" | "secondary";
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState(false);

  const run = async () => {
    setPending(true);
    setError(null);
    const outcome = await startRazorpayCheckout(target, user);
    setPending(false);

    if (outcome.status === "paid") {
      setPaid(true);
      // The webhook may still be in flight, so the plan can take a moment to
      // appear. Refreshing the server component picks it up, and the success
      // note below covers the gap without claiming anything untrue.
      router.refresh();
      return;
    }
    // A dismissed sheet is not an error — the customer changed their mind, and
    // showing them a red message for that is just noise.
    if (outcome.status === "error") setError(outcome.message);
  };

  return (
    <div className={cn("w-full", className)}>
      <button
        type="button"
        onClick={() => void run()}
        disabled={disabled || pending}
        className={cn(
          "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          variant === "primary"
            ? "bg-accent-500 text-[#ffffff] hover:bg-accent-600"
            : "border border-slate-200 text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/[0.06]",
        )}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {pending ? "Opening payment…" : label}
      </button>

      {paid ? (
        <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Payment received — your plan is being activated. This page updates automatically.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}

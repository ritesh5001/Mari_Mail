"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { apiFetchJson } from "@/lib/browser-fetch";

/**
 * Opens the Stripe billing portal.
 *
 * Only rendered for workspaces that actually have a Stripe customer — i.e.
 * those who subscribed before Razorpay became the default checkout. Their
 * subscription still renews through Stripe and the portal is the only place
 * they can update a card or cancel it, so removing this would strand them.
 *
 * New purchases go through Razorpay, which has no equivalent hosted portal:
 * they are one-off orders, so "managing" them means paying again when the
 * period ends, which the plan cards already handle.
 */
export function StripePortalLink() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const body = await apiFetchJson<{ data?: { url?: string } }>("/api/billing/portal", {
              method: "POST",
            });
            if (body?.data?.url) {
              window.location.href = body.data.url;
              return;
            }
            setError("Couldn't open the billing portal.");
          } catch {
            setError("Couldn't reach the billing portal.");
          }
          setPending(false);
        }}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-600 hover:text-accent-500 disabled:opacity-60 dark:text-accent-300"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ExternalLink className="h-3.5 w-3.5" />
        )}
        Manage your Stripe subscription
      </button>
      {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

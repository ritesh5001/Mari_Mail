"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/browser-fetch";

type Props = {
  inlinePlan?: "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE";
  inlineCreditPack?: "1000" | "5000" | "20000";
  disabled?: boolean;
  stripeCustomerConnected?: boolean;
};

export function BillingActions({ inlinePlan, inlineCreditPack, disabled, stripeCustomerConnected }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function checkout(payload: { plan?: string; creditPack?: string }) {
    setError(null);
    const response = await apiFetch(`/api/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as { data?: { url?: string; devMode?: boolean }; error?: { message?: string } };
    if (!response.ok) {
      setError(body.error?.message ?? "Checkout failed");
      return;
    }
    if (body.data?.url) {
      window.location.href = body.data.url;
      return;
    }
    startTransition(() => router.refresh());
  }

  async function openPortal() {
    setError(null);
    const response = await apiFetch(`/api/billing/portal`, { method: "POST" });
    const body = (await response.json()) as { data?: { url?: string }; error?: { message?: string } };
    if (!response.ok) {
      setError(body.error?.message ?? "Portal unavailable");
      return;
    }
    if (body.data?.url) window.location.href = body.data.url;
  }

  if (inlinePlan) {
    return (
      <div className="mt-4">
        <button
          type="button"
          disabled={disabled || pending}
          onClick={() => checkout({ plan: inlinePlan })}
          className={`w-full rounded-md px-3 py-2 text-sm font-semibold ${disabled ? "bg-slate-100 text-slate-500" : "bg-navy text-white hover:bg-navy/90"}`}
        >
          {disabled ? "Current plan" : pending ? "Loading…" : `Choose ${inlinePlan}`}
        </button>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  if (inlineCreditPack) {
    return (
      <div className="mt-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => checkout({ creditPack: inlineCreditPack })}
          className="w-full rounded-md bg-ocean px-3 py-2 text-sm font-semibold text-white hover:bg-ocean/90 disabled:opacity-50"
        >
          {pending ? "Loading…" : "Buy pack"}
        </button>
        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={!stripeCustomerConnected || pending}
        onClick={openPortal}
        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        title={stripeCustomerConnected ? "Manage in Stripe" : "Stripe customer not yet provisioned"}
      >
        Stripe portal
      </button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { apiUrl } from "@/lib/client-api";

export function UnsubscribeClient({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "pending" | "done" | "error">("idle");

  async function unsubscribe() {
    setState("pending");
    const response = await fetch(`${apiUrl}/api/unsubscribe/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    setState(response.ok ? "done" : "error");
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-16">
      <section className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Unsubscribe</h1>
        <p className="mt-3 text-sm text-slate-600">
          This will stop future MariMail campaign messages for this email address.
        </p>
        <button
          type="button"
          onClick={unsubscribe}
          disabled={state === "pending" || state === "done"}
          className="mt-6 rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {state === "pending" ? "Unsubscribing..." : state === "done" ? "Unsubscribed" : "Unsubscribe"}
        </button>
        {state === "error" ? <p className="mt-4 text-sm text-red-600">This unsubscribe link is invalid or expired.</p> : null}
        {state === "done" ? <p className="mt-4 text-sm text-emerald-700">You have been unsubscribed.</p> : null}
      </section>
    </main>
  );
}

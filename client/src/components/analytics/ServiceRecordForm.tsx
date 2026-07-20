"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/browser-fetch";

export function ServiceRecordForm({ imoNumber }: { imoNumber: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(form: FormData) {
    setError(null);
    setSuccess(false);
    const body = {
      serviceName: String(form.get("serviceName") || "").trim(),
      portCode: String(form.get("portCode") || "").trim() || undefined,
      serviceDate: String(form.get("serviceDate") || ""),
      notes: String(form.get("notes") || "").trim() || undefined,
      amount: form.get("amount") ? Number(form.get("amount")) : null,
      currency: String(form.get("currency") || "USD"),
    };
    if (!body.serviceName || !body.serviceDate) {
      setError("Service name and date are required");
      return;
    }
    const response = await apiFetch(`/api/analytics/vessels/${imoNumber}/services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? "Failed to save service");
      return;
    }
    setSuccess(true);
    startTransition(() => router.refresh());
  }

  return (
    <form
      className="space-y-2 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      action={(formData) => {
        submit(formData);
      }}
    >
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Log service</h3>
      <input name="serviceName" placeholder="e.g. Hold cleaning" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      <div className="grid grid-cols-2 gap-2">
        <input name="portCode" placeholder="Port code" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="serviceDate" type="date" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="amount" type="number" step="0.01" placeholder="Amount" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <input name="currency" defaultValue="USD" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <textarea name="notes" rows={2} placeholder="Notes" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {success ? <p className="text-xs text-emerald-700">Service saved.</p> : null}
      <button type="submit" disabled={pending} className="w-full rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Saving…" : "Add service record"}
      </button>
    </form>
  );
}

"use client";

import { useState } from "react";
import { apiUrl } from "@/lib/client-api";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch(`${apiUrl}/auth/forgot-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(form.get("email") ?? "") }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? "Unable to send reset link");
      return;
    }

    setSent(true);
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium text-slate-700">
        Email
        <input name="email" type="email" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" required />
      </label>
      {sent ? <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-ocean">If the account exists, a reset link has been sent.</p> : null}
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button className="w-full rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-ocean">
        Send reset link
      </button>
    </form>
  );
}

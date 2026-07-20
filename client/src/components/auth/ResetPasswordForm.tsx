"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordStrength } from "./PasswordStrength";
import { apiUrl } from "@/lib/client-api";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const response = await fetch(`${apiUrl}/auth/reset-password`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? "Unable to reset password");
      return;
    }

    router.push("/login?reset=1");
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium text-slate-700">
        New password
        <input
          type="password"
          minLength={10}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          required
        />
        <PasswordStrength password={password} />
      </label>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button className="w-full rounded-md bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-ocean">
        Reset password
      </button>
    </form>
  );
}

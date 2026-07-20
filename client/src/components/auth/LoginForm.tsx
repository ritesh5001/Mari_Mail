"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { apiUrl } from "@/lib/client-api";

type LoginDefaults = {
  email: string;
  remember: boolean;
};

const inputCls =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-950 placeholder:text-slate-400 outline-none transition-colors focus:border-accent-500 focus:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/30 dark:focus:bg-white/[0.08]";

const labelCls = "block text-xs font-medium text-slate-600 dark:text-white/70";

export function LoginForm({
  defaults,
  registered,
  serverError,
}: {
  defaults: LoginDefaults;
  registered: boolean;
  serverError: string | null;
}) {
  const [error, setError] = useState<string | null>(serverError);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          remember: form.get("remember") === "on",
        }),
      });
    } catch {
      setPending(false);
      setError("Can't reach the MariMail service. Check your connection and try again.");
      return;
    }

    setPending(false);

    const contentType = response.headers.get("content-type") ?? "";
    const isJson = contentType.includes("application/json");

    if (!response.ok) {
      if (isJson) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(payload?.error?.message ?? "Login failed. Check your email and password.");
      } else if (response.status >= 500) {
        setError(`MariMail service is temporarily unavailable (${response.status}). Please try again shortly.`);
      } else {
        setError(`Login failed (${response.status}). Please try again.`);
      }
      return;
    }

    if (!isJson) {
      setError("Unexpected response from the server. Please try again.");
      return;
    }

    const payload = (await response.json().catch(() => null)) as
      | { data: { activeWorkspace: { onboardedAt: string | null } | null } }
      | null;
    if (!payload?.data) {
      setError("Unexpected response from the server. Please try again.");
      return;
    }
    const dest = payload.data.activeWorkspace?.onboardedAt ? "/dashboard" : "/onboarding";
    window.location.href = dest;
  }

  return (
    <form className="space-y-4" method="post" action={`${apiUrl}/auth/login`} onSubmit={onSubmit}>
      {registered ? (
        <div className="rounded-lg border border-accent-500/30 bg-accent-500/10 px-3.5 py-2.5 text-sm text-accent-300">
          Account created — sign in to continue.
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className={labelCls}>Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaults.email}
          placeholder="you@company.com"
          className={inputCls}
          required
        />
      </div>

      <div>
        <label htmlFor="password" className={labelCls}>Password</label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••••"
            className={`${inputCls} pr-10`}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer select-none dark:text-white/60">
          <input
            name="remember"
            type="checkbox"
            defaultChecked={defaults.remember || !serverError}
            className="h-3.5 w-3.5 rounded border-slate-300 accent-accent-500 dark:border-white/20"
          />
          Remember me
        </label>
        <a href="/forgot-password" className="text-xs font-medium text-accent-400 hover:text-accent-300">
          Forgot password?
        </a>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[#4F6DFF] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_28px_rgba(14, 165, 233,0.4)] transition-all hover:-translate-y-0.5 hover:bg-[#3B4FE6] hover:shadow-[0_12px_36px_rgba(14, 165, 233,0.5)] disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

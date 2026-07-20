"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { PasswordStrength } from "./PasswordStrength";
import { apiUrl } from "@/lib/client-api";

type RegisterDefaults = {
  name: string;
  email: string;
  workspaceName: string;
  termsAccepted: boolean;
};

const inputCls =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-950 placeholder:text-slate-400 outline-none transition-colors focus:border-accent-500 focus:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/30 dark:focus:bg-white/[0.08]";

const labelCls = "block text-xs font-medium text-slate-600 dark:text-white/70";

export function RegisterForm({
  defaults,
  serverError,
}: {
  defaults: RegisterDefaults;
  serverError: string | null;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(serverError);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch(`${apiUrl}/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        password,
        workspaceName: String(form.get("workspaceName") ?? ""),
        termsAccepted: form.get("termsAccepted") === "on",
      }),
    });

    setPending(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? "Registration failed. Please try again.");
      return;
    }

    router.push("/login?registered=1");
  }

  return (
    <form className="space-y-4" method="post" action={`${apiUrl}/auth/register`} onSubmit={onSubmit}>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="name" className={labelCls}>Full name</label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            defaultValue={defaults.name}
            placeholder="Alex Chen"
            className={inputCls}
            required
          />
        </div>
        <div>
          <label htmlFor="workspaceName" className={labelCls}>Workspace name</label>
          <input
            id="workspaceName"
            name="workspaceName"
            type="text"
            defaultValue={defaults.workspaceName}
            placeholder="Acme Shipping"
            className={inputCls}
            required
          />
        </div>
      </div>

      <div>
        <label htmlFor="email" className={labelCls}>Work email</label>
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
            autoComplete="new-password"
            placeholder="••••••••••"
            className={`${inputCls} pr-10`}
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-[calc(50%-2px)] -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <PasswordStrength password={password} />
      </div>

      <label className="flex items-start gap-2.5 cursor-pointer select-none">
        <input
          name="termsAccepted"
          type="checkbox"
          defaultChecked={defaults.termsAccepted}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 accent-accent-500 dark:border-white/20"
          required
        />
        <span className="text-xs leading-5 text-slate-500 dark:text-white/50">
          I agree to use MariMail for permission-based business outreach only.
        </span>
      </label>

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
        {pending ? "Creating workspace…" : "Create your workspace"}
      </button>
    </form>
  );
}

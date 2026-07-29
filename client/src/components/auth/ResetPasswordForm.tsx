"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { PasswordStrength } from "./PasswordStrength";
import { PASSWORD_MIN_LENGTH } from "@marimail/utils/password-policy";
import { apiUrl } from "@/lib/client-api";
import { MotionButton } from "@/components/ui/motion-button";

const inputCls =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-950 placeholder:text-slate-400 outline-none transition-colors focus:border-accent-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/30 dark:focus:bg-white/[0.08]";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/auth/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
    } catch {
      // A network failure used to reject out of the handler unhandled, leaving
      // the form frozen with no message.
      setPending(false);
      setError("Can't reach the MariMail service. Check your connection and try again.");
      return;
    }

    setPending(false);

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      setError(payload?.error?.message ?? "Unable to reset password");
      return;
    }

    router.push("/login?reset=1");
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div>
        <label htmlFor="password" className="block text-xs font-medium text-slate-600 dark:text-white/70">
          New password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••••"
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={`${inputCls} pr-10`}
            required
          />
          {/* Same reveal control as sign-in and registration. It matters most
              here: this field is the only place the new password is typed, so
              a typo can't be caught by a second entry — it just locks you out
              of the account you were trying to recover. */}
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <PasswordStrength password={password} />
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
          {error}
        </p>
      ) : null}

      <MotionButton
        type="submit"
        size="md"
        disabled={pending}
        className="w-full"
        label={pending ? "Saving…" : "Reset password"}
      />
    </form>
  );
}

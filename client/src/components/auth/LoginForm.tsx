"use client";

import { useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { apiUrl } from "@/lib/client-api";
import { MotionButton } from "@/components/ui/motion-button";

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
  // Second-factor step. The server answers the first POST with
  // { mfaRequired: true } and issues no session until a code is supplied, so
  // we keep the credentials to replay them alongside the code.
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  // Shown when sign-in is refused because the address isn't confirmed, so the
  // user can get a fresh link without leaving the page.
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const pendingCredentials = useRef<{ email: string; password: string; remember: boolean } | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const credentials = mfaRequired && pendingCredentials.current
      ? pendingCredentials.current
      : {
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          remember: form.get("remember") === "on",
        };
    pendingCredentials.current = credentials;

    let response: Response;
    try {
      response = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...credentials,
          ...(mfaCode ? { mfaCode } : {}),
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
        const payload = (await response.json().catch(() => null)) as
          | { error?: { message?: string; code?: string } }
          | null;
        if (payload?.error?.code === "EMAIL_NOT_VERIFIED") setNeedsVerification(true);
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
      | { data: { mfaRequired?: boolean; activeWorkspace?: { onboardedAt: string | null } | null } }
      | null;
    if (!payload?.data) {
      setError("Unexpected response from the server. Please try again.");
      return;
    }

    // Password accepted, second factor still outstanding — no session yet.
    if (payload.data.mfaRequired) {
      setMfaRequired(true);
      setMfaCode("");
      return;
    }
    const dest = payload.data.activeWorkspace?.onboardedAt ? "/dashboard" : "/onboarding";
    window.location.href = dest;
  }

  return (
    <form className="space-y-4" method="post" action={`${apiUrl}/auth/login`} onSubmit={onSubmit}>
      {registered ? (
        // Reached by the no-JS form post, which the server redirects here.
        // "Sign in to continue" never mentioned the confirmation email at all.
        // Worded to hold whether or not REQUIRE_EMAIL_VERIFICATION is on —
        // this page is rendered by Next and can't read the API's env, so it
        // must not promise that signing in will or won't be blocked.
        <div className="rounded-lg border border-accent-500/30 bg-accent-500/10 px-3.5 py-2.5 text-sm text-accent-300">
          Account created. We&rsquo;ve emailed you a confirmation link — click it to confirm your
          address.
        </div>
      ) : null}

      {mfaRequired ? (
        <div>
          <label htmlFor="mfaCode" className={labelCls}>
            Authentication code
          </label>
          <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
            Enter the 6-digit code from your authenticator app, or one of your recovery codes.
          </p>
          <input
            id="mfaCode"
            name="mfaCode"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            value={mfaCode}
            onChange={(e) => setMfaCode(e.target.value)}
            placeholder="123456"
            className={`${inputCls} tracking-[0.3em]`}
            required
          />
          <button
            type="button"
            onClick={() => {
              setMfaRequired(false);
              setMfaCode("");
              setError(null);
            }}
            className="mt-2 text-xs font-medium text-slate-500 hover:text-accent-400 dark:text-white/50"
          >
            ← Use a different account
          </button>
        </div>
      ) : (
      <>
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
      </>
      )}

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
          {error}
          {needsVerification ? (
            <button
              type="button"
              disabled={resendState !== "idle"}
              onClick={async () => {
                setResendState("sending");
                try {
                  await fetch(`${apiUrl}/auth/resend-verification`, {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: pendingCredentials.current?.email ?? "" }),
                  });
                } catch {
                  // Endpoint always reports success; a network blip shouldn't
                  // imply the address is or isn't registered.
                }
                setResendState("sent");
              }}
              className="mt-2 block text-xs font-semibold text-accent-300 underline underline-offset-2 disabled:opacity-60"
            >
              {resendState === "sent"
                ? "Verification link sent — check your inbox"
                : resendState === "sending"
                  ? "Sending…"
                  : "Resend verification link"}
            </button>
          ) : null}
        </div>
      ) : null}

      <MotionButton
        type="submit"
        size="md"
        disabled={pending}
        className="w-full"
        label={pending ? "Signing in…" : mfaRequired ? "Verify code" : "Sign in"}
      />
    </form>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { apiUrl } from "@/lib/client-api";

type State =
  | { status: "verifying" }
  | { status: "verified" }
  | { status: "failed"; message: string };

/**
 * Confirms an email-verification token.
 *
 * The token is single-use, so this must fire exactly once — React 18 Strict
 * Mode double-invokes effects in development, and a second call would consume
 * an already-spent token and show a spurious failure. The ref guard prevents
 * that.
 */
export function VerifyEmailView({ token }: { token: string }) {
  const [state, setState] = useState<State>({ status: "verifying" });
  const [resend, setResend] = useState<"idle" | "sending" | "sent">("idle");
  const [email, setEmail] = useState("");
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    (async () => {
      try {
        const res = await fetch(`${apiUrl}/auth/verify-email`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (res.ok) {
          setState({ status: "verified" });
          return;
        }
        const payload = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setState({
          status: "failed",
          message: payload?.error?.message ?? "This confirmation link is invalid or has expired.",
        });
      } catch {
        setState({
          status: "failed",
          message: "We couldn't reach MariMail to confirm your email. Please try again.",
        });
      }
    })();
  }, [token]);

  if (state.status === "verifying") {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <Loader2 className="mb-4 h-8 w-8 animate-spin text-accent-500" />
        <p className="text-sm text-slate-600 dark:text-white/60">Confirming your email address…</p>
      </div>
    );
  }

  if (state.status === "verified") {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15">
          <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        </div>
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Email confirmed</h2>
        <p className="mt-1.5 max-w-xs text-sm text-slate-600 dark:text-white/60">
          Your workspace is active. Sign in to start tracking vessel arrivals.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent-500 px-4 text-sm font-semibold text-[#ffffff] transition-colors hover:bg-accent-600"
        >
          Continue to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-red-500/15">
        <XCircle className="h-6 w-6 text-red-500" />
      </div>
      <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
        We couldn&rsquo;t confirm that link
      </h2>
      <p className="mt-1.5 max-w-xs text-sm text-slate-600 dark:text-white/60">{state.message}</p>

      {/* Recovery path: a dead end here means the account can never activate. */}
      {resend === "sent" ? (
        <p className="mt-6 text-sm font-medium text-emerald-600 dark:text-emerald-400">
          If that address needs confirming, a new link is on its way.
        </p>
      ) : (
        <div className="mt-6 w-full space-y-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-accent-500 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-white/30"
          />
          <button
            type="button"
            disabled={resend === "sending" || !email.trim()}
            onClick={async () => {
              setResend("sending");
              try {
                await fetch(`${apiUrl}/auth/resend-verification`, {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: email.trim() }),
                });
              } catch {
                // The endpoint always reports success; a network blip must not
                // reveal whether the address is registered.
              }
              setResend("sent");
            }}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent-500 px-4 text-sm font-semibold text-[#ffffff] transition-colors hover:bg-accent-600 disabled:opacity-50"
          >
            {resend === "sending" ? "Sending…" : "Send me a new link"}
          </button>
        </div>
      )}
    </div>
  );
}

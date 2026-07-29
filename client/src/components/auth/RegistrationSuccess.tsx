"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Mail } from "lucide-react";
import { apiUrl } from "@/lib/client-api";

/**
 * Shown in place of the register form once the account exists.
 *
 * Registration sends a verification link. The form used to redirect straight
 * to /login?registered=1, whose banner read "Account created — sign in to
 * continue" and never mentioned that an email had been sent at all — so anyone
 * who didn't happen to spot it in their inbox had no idea a step remained. With
 * REQUIRE_EMAIL_VERIFICATION on, that advice was also actively wrong: login
 * rejects an unconfirmed account with EMAIL_NOT_VERIFIED.
 */
export function RegistrationSuccess({
  email,
  verificationRequired,
}: {
  email: string;
  /**
   * Mirrors the server's REQUIRE_EMAIL_VERIFICATION setting. Whether confirming
   * is a hard gate or a recommendation changes what this screen may promise —
   * claiming "you can't sign in until you confirm" on a server that happily
   * lets you in reads as a broken product.
   */
  verificationRequired: boolean;
}) {
  const [resend, setResend] = useState<"idle" | "sending" | "sent">("idle");

  return (
    <div className="py-2 text-center">
      <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15">
        <CheckCircle2 className="h-7 w-7 text-emerald-500" />
      </div>

      <h2 className="text-xl font-semibold text-slate-950 dark:text-white">
        {verificationRequired
          ? "Workspace created — now confirm your email"
          : "Workspace created"}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600 dark:text-white/60">
        We sent a confirmation link to{" "}
        <span className="font-semibold text-slate-900 dark:text-white">{email}</span>.{" "}
        {verificationRequired
          ? "Click it to activate your workspace — you won't be able to sign in until you do."
          : "Click it when you get a chance to confirm the address is yours. You can sign in now either way."}
      </p>

      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left dark:border-white/10 dark:bg-white/[0.04]">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-white/85">
          <Mail className="h-4 w-4 shrink-0" />
          Didn&rsquo;t get it?
        </p>
        <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600 dark:text-white/55">
          <li>· Check your spam or promotions folder.</li>
          <li>· The link is valid for 24 hours.</li>
          <li>· Corporate mail filters can delay it by a few minutes.</li>
        </ul>

        {resend === "sent" ? (
          <p className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            Sent again — check your inbox.
          </p>
        ) : (
          <button
            type="button"
            disabled={resend === "sending"}
            onClick={async () => {
              setResend("sending");
              try {
                await fetch(`${apiUrl}/auth/resend-verification`, {
                  method: "POST",
                  credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                });
              } catch {
                // The endpoint always reports success so it can't be used to
                // probe which addresses are registered; a network blip must not
                // contradict that.
              }
              setResend("sent");
            }}
            className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-white disabled:opacity-60 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/[0.06]"
          >
            {resend === "sending" ? "Sending…" : "Resend the link"}
          </button>
        )}
      </div>

      <Link
        href="/login"
        className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent-500 px-4 text-sm font-semibold text-[#ffffff] transition-colors hover:bg-accent-600"
      >
        {verificationRequired ? "Go to sign in" : "Continue to sign in"}
      </Link>
      {verificationRequired ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-white/40">
          Already confirmed it? Sign in above.
        </p>
      ) : null}
    </div>
  );
}

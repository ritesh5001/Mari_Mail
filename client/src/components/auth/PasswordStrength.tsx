"use client";

import { Check } from "lucide-react";
import {
  PASSWORD_MIN_CLASSES,
  PASSWORD_MIN_LENGTH,
  evaluatePassword,
} from "@marimail/utils/password-policy";

/**
 * Live password-requirements checklist.
 *
 * Replaces the old 4-bar strength meter, which told you a password was "Weak"
 * without saying what to fix. Each rule now turns green with a tick the moment
 * it's satisfied.
 *
 * The rules come from the shared policy module the API validates against, so a
 * green tick always means the server will accept it — the checklist can't drift
 * out of sync with enforcement.
 */
function Rule({
  ok,
  children,
  nested,
}: {
  ok: boolean;
  children: React.ReactNode;
  nested?: boolean;
}) {
  return (
    <li
      className={`flex items-start gap-2 text-[13px] leading-5 transition-colors ${
        nested ? "ml-5" : ""
      } ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500 dark:text-white/45"}`}
    >
      <span
        className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center transition-colors ${
          ok ? "text-emerald-600 dark:text-emerald-400" : "text-slate-300 dark:text-white/20"
        }`}
        aria-hidden
      >
        {ok ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        )}
      </span>
      <span>{children}</span>
      {/* Colour + tick alone don't reach a screen reader. */}
      <span className="sr-only">{ok ? " — requirement met" : " — not yet met"}</span>
    </li>
  );
}

export function PasswordStrength({ password }: { password: string }) {
  const result = evaluatePassword(password);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="mb-2 text-[13px] font-medium text-slate-700 dark:text-white/75">
        Your password must contain:
      </p>
      <ul className="space-y-1.5">
        <Rule ok={result.lengthOk}>At least {PASSWORD_MIN_LENGTH} characters</Rule>
        <Rule ok={result.classesOk}>
          At least {PASSWORD_MIN_CLASSES} of the following:
          {!result.classesOk && password.length > 0 ? (
            <span className="ml-1 text-slate-400 dark:text-white/35">
              ({result.classesMet}/{PASSWORD_MIN_CLASSES})
            </span>
          ) : null}
        </Rule>
        {result.classes.map((cls) => (
          <Rule key={cls.id} ok={cls.ok} nested>
            {cls.label}
          </Rule>
        ))}
      </ul>
    </div>
  );
}

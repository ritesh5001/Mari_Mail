"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm, type RegisterDefaults } from "@/components/auth/RegisterForm";
import { RegistrationSuccess } from "@/components/auth/RegistrationSuccess";

/**
 * Owns the register page's two states so the AuthShell heading switches with
 * the body.
 *
 * The success screen can't live inside RegisterForm alone: the shell's title
 * ("Start for free" / "Set up your workspace in under 2 minutes") is a sibling
 * of the form, so it would have sat directly above "Workspace created — now
 * confirm your email". AuthShell is plain markup with no server-only
 * dependencies, so a client component can render it and swap all four slots at
 * once.
 */
export function RegisterPanel({
  defaults,
  serverError,
}: {
  defaults: RegisterDefaults;
  serverError: string | null;
}) {
  // Held here rather than in a query param so the address never lands in
  // browser history, referrer headers or server logs.
  const [registered, setRegistered] = useState<{
    email: string;
    verificationRequired: boolean;
  } | null>(null);

  if (registered) {
    return (
      <AuthShell
        title="Check your email"
        subtitle={
          registered.verificationRequired
            ? "One last step before your workspace is live."
            : "Your workspace is ready — confirm your address to secure it."
        }
        footer={
          <>
            Wrong address?{" "}
            <Link href="/register" className="font-semibold text-accent-400 hover:text-accent-300">
              Start over
            </Link>
          </>
        }
      >
        <RegistrationSuccess
          email={registered.email}
          verificationRequired={registered.verificationRequired}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Start for free"
      subtitle="Set up your workspace in under 2 minutes. No credit card required."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent-400 hover:text-accent-300">
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm
        defaults={defaults}
        serverError={serverError}
        onRegistered={(email, verificationRequired) =>
          setRegistered({ email, verificationRequired })
        }
      />
    </AuthShell>
  );
}

import { notFound } from "next/navigation";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { MfaPanel } from "@/components/settings/MfaPanel";
import { SessionsPanel } from "@/components/settings/SessionsPanel";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { getServerSession } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * Everything here was already implemented on the server and had no UI at all:
 * `POST /auth/change-password`, `GET|DELETE /auth/sessions`, and the whole
 * `/auth/mfa/*` set with encrypted secrets and recovery codes. The sessions
 * endpoint even returns a `current` flag with a comment explaining it exists
 * "so the UI can label one 'this device'" — for a UI that was never built.
 */
export default async function SecuritySettingsPage() {
  const session = await getServerSession();
  if (!session) notFound();

  return (
    <div className="space-y-4">
      <SettingsCard title="Password" description="Used to sign in, and to turn two-factor off.">
        <ChangePasswordForm />
      </SettingsCard>

      <SettingsCard
        title="Two-factor authentication"
        description="Require a code from your authenticator app in addition to your password."
      >
        <MfaPanel enabled={session.user.mfaEnabled} />
      </SettingsCard>

      <SettingsCard
        title="Signed-in devices"
        description="Every active session on your account. Sign out anything you don't recognise."
      >
        <SessionsPanel />
      </SettingsCard>
    </div>
  );
}

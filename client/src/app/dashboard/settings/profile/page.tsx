import { notFound } from "next/navigation";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { SettingsCard } from "@/components/settings/SettingsCard";
import { getServerSession } from "@/lib/api";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export default async function ProfileSettingsPage() {
  const session = await getServerSession();
  if (!session) notFound();

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Your details"
        description="How you appear to teammates across the workspace."
      >
        <ProfileForm
          name={session.user.name ?? ""}
          email={session.user.email}
          emailVerified={Boolean(session.user.emailVerified)}
        />
      </SettingsCard>

      <SettingsCard
        title="Workspace"
        description="Which workspace you are working in, and what you can do there."
      >
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500 dark:text-white/45">Workspace</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
              {session.activeWorkspace?.name ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-white/45">Your role</dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-900 dark:text-white">
              {session.activeWorkspace ? ROLE_LABEL[session.activeWorkspace.role] : "—"}
            </dd>
          </div>
        </dl>
        {session.workspaces.length > 1 ? (
          <p className="mt-3 text-xs text-slate-500 dark:text-white/45">
            You belong to {session.workspaces.length} workspaces. Switch between them from the
            workspace menu in the header.
          </p>
        ) : null}
      </SettingsCard>
    </div>
  );
}

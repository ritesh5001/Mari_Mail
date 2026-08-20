import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/api";
import { SettingsNav } from "@/components/settings/SettingsNav";

/**
 * Workspace settings. Any signed-in member reaches this.
 *
 * It used to redirect everyone but super-admins to /dashboard, on the stated
 * grounds that sending defaults, port rules and cargo rules were "genuine
 * platform-config pages". The code never agreed: all three read and write
 * per-workspace rows (`listPortRules(workspaceId)`,
 * `/workspaces/me/send-gap-defaults`), and every endpoint behind them is
 * `requireAuth` + workspace-scoped, not super-admin. So the gate wasn't
 * protecting platform config — it was locking customers out of their own
 * campaign automation, with the server perfectly willing to serve them.
 *
 * Genuine platform config lives under /dashboard/admin/*, which has its own
 * super-admin checks.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (!session.activeWorkspace) redirect("/onboarding");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">Settings</h1>
      </header>
      <div className="flex flex-col gap-6 lg:flex-row">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

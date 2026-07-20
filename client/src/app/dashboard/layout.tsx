import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SessionRefresher } from "@/components/dashboard/SessionRefresher";
import { getServerSession } from "@/lib/api";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if (!session.activeWorkspace?.onboardedAt) {
    redirect("/onboarding");
  }

  return (
    <DashboardShell session={session}>
      <SessionRefresher />
      {children}
    </DashboardShell>
  );
}

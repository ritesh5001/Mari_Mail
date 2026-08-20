import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SessionRefresher } from "@/components/dashboard/SessionRefresher";
import { getServerSession } from "@/lib/api";
import { getCampaignItineraryProgress } from "@/lib/onboarding-data";
import { getActivity } from "@/lib/activity-data";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if (!session.activeWorkspace?.onboardedAt) {
    redirect("/onboarding");
  }

  // Both feed the shell's chrome and neither depends on the other. Activity is
  // loaded here rather than behind an API route so the bell has data on first
  // paint, the same way the onboarding progress does.
  const [itinerary, activity] = await Promise.all([
    getCampaignItineraryProgress(session.activeWorkspace.id, session.user.id),
    getActivity(session.activeWorkspace.id, 8),
  ]);

  return (
    <DashboardShell session={session} onboardingProgress={itinerary} activity={activity}>
      <SessionRefresher />
      {children}
    </DashboardShell>
  );
}

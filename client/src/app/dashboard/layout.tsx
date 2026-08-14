import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SessionRefresher } from "@/components/dashboard/SessionRefresher";
import { getServerSession } from "@/lib/api";
import { getCampaignItineraryProgress } from "@/lib/onboarding-data";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if (!session.activeWorkspace?.onboardedAt) {
    redirect("/onboarding");
  }

  const itinerary = await getCampaignItineraryProgress(
    session.activeWorkspace.id,
    session.user.id,
  );

  return (
    <DashboardShell session={session} onboardingProgress={itinerary}>
      <SessionRefresher />
      {children}
    </DashboardShell>
  );
}

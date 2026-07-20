import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/api";
import { OnboardingWizard } from "@/components/auth/OnboardingWizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await getServerSession();
  if (!session) redirect("/login");
  if (session.activeWorkspace?.onboardedAt) redirect("/dashboard");
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10">
      <div className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-8 shadow-shell">
        <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-ocean">Onboarding</p>
        <h1 className="text-3xl font-semibold text-slate-950">Welcome to MariMail</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          A few quick steps. You can skip any optional step and come back later from the dashboard.
        </p>
        <div className="mt-8">
          <OnboardingWizard defaultName={session.activeWorkspace?.name ?? "MariMail Workspace"} />
        </div>
      </div>
    </main>
  );
}

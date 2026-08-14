import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { apiUrl, getServerSession } from "@/lib/api";
import { ReferralsPanel } from "@/components/billing/ReferralsPanel";

export const dynamic = "force-dynamic";

export type ReferralRowDTO = {
  id: string;
  status: "PENDING" | "REWARDED" | "EXPIRED";
  expiresAt: string;
  rewardCredits: number | null;
  rewardedAt: string | null;
  createdAt: string;
  referred: { name: string | null; email: string };
  referredWorkspace: { name: string; plan: string; billingStatus: string };
};

export type ReferralSummaryDTO = {
  code: string;
  referrals: ReferralRowDTO[];
  totals: { invited: number; converted: number; creditsEarned: number; pending: number };
  rewardRatePercent: number;
  windowDays: number;
};

async function loadReferrals(): Promise<ReferralSummaryDTO | null> {
  const res = await fetch(`${apiUrl}/api/referrals/me`, {
    headers: { Cookie: cookies().toString() },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { data: ReferralSummaryDTO };
  return payload.data;
}

export default async function ReferralsPage() {
  const session = await getServerSession();
  if (!session?.activeWorkspace) notFound();

  const summary = await loadReferrals();
  if (!summary) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
        Failed to load your referrals. Make sure the API server is running.
      </div>
    );
  }

  return <ReferralsPanel summary={summary} />;
}

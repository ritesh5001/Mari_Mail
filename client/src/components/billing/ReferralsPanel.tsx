"use client";

import { useState } from "react";
import { InfoHint } from "@/components/ui/InfoHint";
import { Check, Coins, Copy, Gift, Users } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ReferralRowDTO, ReferralSummaryDTO } from "@/app/dashboard/referrals/page";

const STATUS_STYLE: Record<ReferralRowDTO["status"], { label: string; className: string }> = {
  PENDING: {
    label: "Trial in progress",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  },
  REWARDED: {
    label: "Paid",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  },
  EXPIRED: {
    label: "Window closed",
    className: "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/60",
  },
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

export function ReferralsPanel({ summary }: { summary: ReferralSummaryDTO }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  // Built in the browser so the link always points at the host the user is
  // actually on — a server-rendered origin would hand out staging URLs from a
  // staging session, and this is the one string people paste into emails.
  const inviteLink =
    typeof window === "undefined"
      ? `/register?ref=${summary.code}`
      : `${window.location.origin}/register?ref=${summary.code}`;

  async function copy(value: string, which: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked — the value is on screen to copy by hand */
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Referrals</p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-950 dark:text-white">
          <Gift className="h-6 w-6 text-ocean" />
          Invite and earn credits
          <InfoHint>
            Share your link. When someone signs up with it and subscribes within {summary.windowDays} days,
            you get {summary.rewardRatePercent}% of their plan&rsquo;s credits, added straight to this workspace.
            Their plan and price are unaffected.
          </InfoHint>
        </h1>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-ocean/40 bg-ocean/[0.04] px-4 py-3">
            <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-white/50">Your code</span>
            <span className="font-mono text-lg font-bold tracking-widest text-slate-900 dark:text-white">
              {summary.code}
            </span>
            <button
              type="button"
              onClick={() => void copy(summary.code, "code")}
              className="rounded-md p-1.5 text-slate-500 transition hover:bg-white hover:text-ocean dark:text-white/60 dark:hover:bg-white/10"
              aria-label="Copy code"
            >
              {copied === "code" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => void copy(inviteLink, "link")}
            className="inline-flex items-center gap-2 rounded-md bg-ocean px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === "link" ? "Link copied" : "Copy invite link"}
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Users} label="Invited" value={summary.totals.invited} />
        <Stat icon={Check} label="Subscribed" value={summary.totals.converted} tone="emerald" />
        <Stat icon={Coins} label="Credits earned" value={summary.totals.creditsEarned} tone="ocean" />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-white/[0.08]">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">People you invited</h2>
        </div>
        {summary.referrals.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500 dark:text-white/50">
            Nobody has signed up with your link yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {summary.referrals.map((referral) => {
              const status = STATUS_STYLE[referral.status];
              const left = daysLeft(referral.expiresAt);
              return (
                <li key={referral.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {referral.referred.name ?? referral.referred.email}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-white/50">
                      Joined {formatDate(referral.createdAt)}
                      {referral.status === "PENDING"
                        ? ` · ${left} day${left === 1 ? "" : "s"} left to subscribe`
                        : referral.status === "REWARDED" && referral.rewardedAt
                          ? ` · paid ${formatDate(referral.rewardedAt)}`
                          : ` · window closed ${formatDate(referral.expiresAt)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {referral.rewardCredits ? (
                      <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-300">
                        +{referral.rewardCredits.toLocaleString()}
                      </span>
                    ) : null}
                    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status.className)}>
                      {status.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "slate",
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone?: "slate" | "emerald" | "ocean";
}) {
  const toneClass = {
    slate: "text-slate-900 dark:text-white",
    emerald: "text-emerald-600 dark:text-emerald-300",
    ocean: "text-ocean",
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
      <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500 dark:text-white/50">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>{value.toLocaleString()}</p>
    </div>
  );
}

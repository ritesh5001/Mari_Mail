"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

/**
 * Auto-creates a draft campaign with a default name and jumps straight into
 * the wizard's first step (Leads). The name lives in the editor header where
 * the user can rename it inline, so we no longer need a separate name page.
 */
export function NewCampaignForm({
  triggerType = "MANUAL",
  kindLabel = "campaign",
  backHref = "/dashboard/campaigns",
}: {
  triggerType?: "MANUAL" | "ETA_BASED";
  kindLabel?: string;
  backHref?: string;
} = {}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const kind = `${kindLabel[0].toUpperCase()}${kindLabel.slice(1)}`;
        const res = await apiFetch(`/api/campaigns`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: `Untitled ${kind}`,
            status: "DRAFT",
            triggerType,
            sendingMode: "BULK_CAMPAIGN",
            fromAccountIds: [],
            rotationStrategy: "ROUND_ROBIN",
            // Conservative default — new inboxes need to ramp up before
            // safely sending hundreds/day. Users bump this in Options.
            dailyLimit: 50,
            // Omit sendGapSeconds/sendGapMaxSeconds so the server seeds the
            // workspace's default random send-gap range (5–20 min by default).
            timezone: "UTC",
            scheduleDays: [1, 2, 3, 4, 5],
            scheduleHourStart: 9,
            scheduleHourEnd: 17,
            targetConfig: {
              roles: [],
              marineRoles: [],
              contactListIds: [],
              contactIds: [],
            },
            triggerConfig: {
              portCodes: [],
              vesselTypes: [],
              previousCargo: [],
              nextCargo: [],
              autoEnroll: true,
              priority: 100,
            },
            sequences: [],
          }),
        });
        const payload = (await res.json()) as {
          data?: { campaign?: { id: string } };
          error?: { message?: string };
        };
        if (!res.ok || !payload.data?.campaign?.id) {
          setError(payload.error?.message ?? `Failed to create ${kindLabel}`);
          return;
        }
        router.replace(`/dashboard/campaigns/${payload.data.campaign.id}/edit?tab=leads`);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [kindLabel, router, triggerType]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-ocean"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to {kindLabel}s
      </Link>
      <div className="mt-10 flex flex-col items-center gap-3 text-center">
        {error ? (
          <>
            <p className="text-lg font-semibold text-red-700">Couldn&rsquo;t start the {kindLabel}</p>
            <p className="text-sm text-slate-600 dark:text-white/60">{error}</p>
            <Link
              href={backHref}
              className="mt-2 rounded-md bg-[#4F6DFF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3B4FE6]"
            >
              Go back
            </Link>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-ocean" />
            <p className="text-sm text-slate-600 dark:text-white/60">
              Setting up your new {kindLabel}…
            </p>
          </>
        )}
      </div>
    </div>
  );
}

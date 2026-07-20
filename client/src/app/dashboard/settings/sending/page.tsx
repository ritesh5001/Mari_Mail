import Link from "next/link";
import { cookies } from "next/headers";
import { apiUrl } from "@/lib/api";
import { SendGapDefaultsForm } from "@/components/settings/SendGapDefaultsForm";

export const dynamic = "force-dynamic";

async function loadDefaults(): Promise<{ min: number; max: number }> {
  const cookieHeader = cookies().toString();
  try {
    const res = await fetch(`${apiUrl}/workspaces/me/send-gap-defaults`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return { min: 300, max: 1200 };
    const payload = (await res.json()) as {
      data: { defaultSendGapMinSeconds: number; defaultSendGapMaxSeconds: number };
    };
    return {
      min: payload.data.defaultSendGapMinSeconds,
      max: payload.data.defaultSendGapMaxSeconds,
    };
  } catch {
    return { min: 300, max: 1200 };
  }
}

export default async function SendingSettingsPage() {
  const { min, max } = await loadDefaults();
  return (
    <div className="space-y-6">
      <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Settings</p>
        <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">Sending defaults</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-white/60">
          Workspace-wide defaults applied to every new campaign. You can still override the gap per campaign
          from the campaign&apos;s Options step.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          <Link className="text-ocean hover:underline" href="/dashboard/settings">← Back to settings</Link>
        </p>
      </header>
      <SendGapDefaultsForm initialMinSeconds={min} initialMaxSeconds={max} />
    </div>
  );
}

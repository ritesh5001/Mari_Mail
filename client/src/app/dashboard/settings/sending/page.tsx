import { cookies } from "next/headers";
import { apiUrl } from "@/lib/api";
import { SendGapDefaultsForm } from "@/components/settings/SendGapDefaultsForm";
import { SettingsCard } from "@/components/settings/SettingsCard";

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

// Header and back-link removed: the settings layout supplies the page title
// and a persistent section nav, so both were a second copy of navigation the
// reader can already see.
export default async function SendingSettingsPage() {
  const { min, max } = await loadDefaults();
  return (
    <SettingsCard
      title="Sending defaults"
      description="The random gap between two outgoing emails, applied to every new campaign. Spacing sends makes a sequence look less automated to inbox providers."
    >
      <SendGapDefaultsForm initialMinSeconds={min} initialMaxSeconds={max} />
    </SettingsCard>
  );
}

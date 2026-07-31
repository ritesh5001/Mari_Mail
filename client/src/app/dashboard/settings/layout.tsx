import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/api";

/**
 * Everything under /dashboard/settings/* is super-admin-only: sending domains,
 * port rules, cargo rules — genuine platform-config pages.
 *
 * Billing used to live at /dashboard/settings/billing and inherited this same
 * gate, which meant a workspace OWNER — not platform staff, but the person
 * whose card is on file and whose trial is running out — was bounced straight
 * back to /dashboard trying to reach it. It has since moved to its own route,
 * /dashboard/billing, with its own OWNER/ADMIN-or-super-admin rule (see
 * app/dashboard/billing/layout.tsx). Next.js layouts are additive down the
 * route tree — a nested layout runs in ADDITION to this one, never instead of
 * it — so relaxing the rule for billing specifically required moving it out of
 * this subtree rather than adding a more specific layout underneath it.
 */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user.isSuperAdmin) {
    redirect("/dashboard");
  }
  return <>{children}</>;
}

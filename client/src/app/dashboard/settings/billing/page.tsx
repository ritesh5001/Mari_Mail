import { redirect } from "next/navigation";

/**
 * Billing moved to /dashboard/billing so a workspace OWNER (not just
 * super-admins) can reach it — see settings/layout.tsx and
 * dashboard/billing/layout.tsx for why. This stub keeps the old URL working
 * for anyone with it bookmarked or linked from an old email.
 */
export default function LegacyBillingRedirect() {
  redirect("/dashboard/billing");
}

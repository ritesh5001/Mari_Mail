import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/api";

/**
 * Reachable by the active workspace's OWNER or ADMIN.
 *
 * It used to live under /dashboard/settings, which is super-admin-only —
 * appropriate for the platform-config pages there (sending domains, port
 * rules), wrong for billing. Billing is the workspace's own money and its own
 * trial; a customer who owns their workspace needs to reach it without being
 * platform staff.
 *
 * Two exclusions, for opposite reasons:
 *
 *   · a plain MEMBER — someone invited onto a team shouldn't be able to change
 *     what the workspace is charged.
 *   · a SUPER-ADMIN — platform staff run the admin panel. They manage
 *     customers; they are not customers, and a plan or invoice is not theirs
 *     to look at. Granting country access and issuing payment links, which is
 *     the billing-shaped work they DO have, lives in the admin routes.
 */
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const role = session.activeWorkspace?.role;
  const canManageBilling =
    !session.user.isSuperAdmin && (role === "OWNER" || role === "ADMIN");
  if (!canManageBilling) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}

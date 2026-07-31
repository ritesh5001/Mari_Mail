import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/api";

/**
 * Reachable by a super-admin, or by the active workspace's own OWNER/ADMIN.
 *
 * It used to live under /dashboard/settings, which is super-admin-only —
 * appropriate for the platform-config pages there (sending domains, port
 * rules), wrong for billing. Billing is the workspace's own money and its own
 * trial; a normal customer who owns their workspace needs to be able to reach
 * it without being platform staff. A plain MEMBER still can't — someone
 * invited onto a team shouldn't be able to change what the workspace is
 * charged.
 */
export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  const role = session.activeWorkspace?.role;
  const canManageBilling = session.user.isSuperAdmin || role === "OWNER" || role === "ADMIN";
  if (!canManageBilling) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}

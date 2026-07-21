import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/api";

// CSV import (vessels, contacts, marine data) is a super-admin-only tool.
// Normal users have no import entry points in the UI; this gate also blocks
// direct navigation to /dashboard/import.
export default async function ImportLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user.isSuperAdmin) {
    redirect("/dashboard");
  }
  return <>{children}</>;
}

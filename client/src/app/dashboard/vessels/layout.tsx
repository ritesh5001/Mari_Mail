import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/api";

export default async function VesselsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user.isSuperAdmin) {
    redirect("/dashboard/port-radar");
  }
  return <>{children}</>;
}

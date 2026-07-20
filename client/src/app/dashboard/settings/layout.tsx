import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/api";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user.isSuperAdmin) {
    redirect("/dashboard");
  }
  return <>{children}</>;
}

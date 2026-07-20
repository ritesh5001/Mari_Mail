import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Marketing } from "@/components/marketing/Marketing";

export default async function Home() {
  const cookieStore = cookies();
  if (cookieStore.has("marimail_access")) {
    redirect("/dashboard");
  }
  return <Marketing />;
}

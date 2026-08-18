import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { apiUrl, getServerSession } from "@/lib/api";
import { DripTable, type DripDTO } from "./DripTable";

export const dynamic = "force-dynamic";

async function loadDrips(): Promise<{ drips: DripDTO[]; loadError: string | null }> {
  try {
    const res = await fetch(`${apiUrl}/api/admin/apollo-drips`, {
      headers: { Cookie: cookies().toString() },
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        drips: [],
        loadError: `Drips endpoint returned ${res.status}. The server may not be restarted with the drip routes yet, or the migration may not have been applied.`,
      };
    }
    const payload = (await res.json()) as { data: { drips: DripDTO[] } };
    return { drips: payload.data.drips, loadError: null };
  } catch (error) {
    return { drips: [], loadError: `Unable to reach API server: ${(error as Error).message}` };
  }
}

export default async function AdminApolloDripsPage() {
  const session = await getServerSession();
  if (!session?.user.isSuperAdmin) redirect("/dashboard");

  const { drips, loadError } = await loadDrips();

  return (
    <div className="space-y-5 p-6">
      <div>
        <Link
          href="/dashboard/admin/contact-source"
          className="text-[11px] text-slate-500 hover:underline dark:text-white/50"
        >
          ← Contact data source
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-950 dark:text-white">
          Scheduled reveals
        </h1>
      </div>

      {loadError ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          {loadError}
        </p>
      ) : null}

      <DripTable initialDrips={drips} />
    </div>
  );
}

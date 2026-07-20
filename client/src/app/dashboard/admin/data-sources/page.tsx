import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { apiUrl, getServerSession } from "@/lib/api";
import { DataSourcesAdmin } from "@/components/admin/DataSourcesAdmin";

export type DataSourcesDTO = {
  internal: { enabled: boolean };
  maribiz: { enabled: boolean; hasApiKey: boolean };
  apollo: { enabled: boolean; hasApiKey: boolean; creditsPerEmailReveal: number; creditsPerPhoneReveal: number };
  persistApolloSearchRows: boolean;
};

const DEFAULTS: DataSourcesDTO = {
  internal: { enabled: true },
  maribiz: { enabled: false, hasApiKey: false },
  apollo: { enabled: false, hasApiKey: false, creditsPerEmailReveal: 1, creditsPerPhoneReveal: 1 },
  persistApolloSearchRows: true,
};

async function load(): Promise<{ data: DataSourcesDTO; loadError: string | null }> {
  try {
    const cookieHeader = cookies().toString();
    const res = await fetch(`${apiUrl}/api/admin/data-sources`, { headers: { Cookie: cookieHeader }, cache: "no-store" });
    if (!res.ok) return { data: DEFAULTS, loadError: `Failed to load (${res.status})` };
    const payload = (await res.json()) as { data: DataSourcesDTO };
    return { data: payload.data, loadError: null };
  } catch (e) {
    return { data: DEFAULTS, loadError: (e as Error).message };
  }
}

export default async function AdminDataSourcesPage() {
  const session = await getServerSession();
  if (!session?.user.isSuperAdmin) notFound();
  const { data, loadError } = await load();
  return <DataSourcesAdmin initial={data} loadError={loadError} />;
}

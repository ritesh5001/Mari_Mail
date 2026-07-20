import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { apiUrl, getServerSession } from "@/lib/api";
import { MaribizDataSourceAdmin } from "@/components/admin/MaribizDataSourceAdmin";

export type MaribizSettingsDTO = {
  id: string;
  enabled: boolean;
  cacheTtlSeconds: number;
  maxResultsPerQuery: number;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  lastTestTotalRows: number | null;
  lastTestLatencyMs: number | null;
  updatedAt: string;
  apiUrl: string | null;
  apiKeyConfigured: boolean;
};

export type MaribizUsageDTO = {
  today: { queries: number; cacheHits: number };
  last7d: { queries: number; cacheHits: number };
};

async function loadMaribizData() {
  const cookieHeader = cookies().toString();
  const [settingsRes, usageRes] = await Promise.all([
    fetch(`${apiUrl}/api/admin/maribiz/settings`, { headers: { Cookie: cookieHeader }, cache: "no-store" }),
    fetch(`${apiUrl}/api/admin/maribiz/usage`, { headers: { Cookie: cookieHeader }, cache: "no-store" }),
  ]);

  if (!settingsRes.ok) return null;

  const settings = ((await settingsRes.json()) as { data: MaribizSettingsDTO }).data;
  const usage = usageRes.ok
    ? ((await usageRes.json()) as { data: MaribizUsageDTO }).data
    : { today: { queries: 0, cacheHits: 0 }, last7d: { queries: 0, cacheHits: 0 } };

  return { settings, usage };
}

export default async function AdminMaribizPage() {
  const session = await getServerSession();
  if (!session?.user.isSuperAdmin) {
    notFound();
  }

  const data = await loadMaribizData();
  if (!data) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
        Failed to load secondary database settings. Make sure the API server is running.
      </div>
    );
  }

  return <MaribizDataSourceAdmin initialSettings={data.settings} initialUsage={data.usage} />;
}

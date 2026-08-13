import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { apiUrl, getServerSession } from "@/lib/api";
import { ApolloDataSourceAdmin } from "@/components/admin/ApolloDataSourceAdmin";

export type ApolloSettingsDTO = {
  id: string;
  enabled: boolean;
  hasApiKey: boolean;
  apiBaseUrl: string;
  cacheTtlSeconds: number;
  maxResultsPerQuery: number;
  creditsPerEmailReveal: number;
  creditsPerPhoneReveal: number;
  lastTestAt: string | null;
  lastTestStatus: string | null;
  lastTestError: string | null;
  lastTestLatencyMs: number | null;
  updatedAt: string;
};

export type ApolloUsageDTO = {
  today: { queries: number; emailReveals: number; phoneReveals: number; cacheHits: number };
  last7d: { queries: number; emailReveals: number; phoneReveals: number; cacheHits: number };
};

export type ApolloCreditAnalyticsDTO = {
  lifetime: {
    emailCredits: number;
    phoneCredits: number;
    refundCredits: number;
    emailReveals: number;
    phoneReveals: number;
    refunds: number;
    totalCreditsSpent: number;
    netCredits: number;
    costEstimateUsd: number;
  };
  series: Array<{
    date: string;
    emailCredits: number;
    phoneCredits: number;
    refundCredits: number;
    net: number;
  }>;
  topWorkspaces: Array<{
    workspaceId: string;
    workspaceName: string;
    plan: string | null;
    creditBalance: number;
    emailReveals: number;
    phoneReveals: number;
    spent: number;
    refunded: number;
    net: number;
  }>;
};

const DEFAULT_SETTINGS: ApolloSettingsDTO = {
  id: "singleton",
  enabled: false,
  hasApiKey: false,
  apiBaseUrl: "https://api.apollo.io/api/v1",
  cacheTtlSeconds: 1800,
  maxResultsPerQuery: 25,
  creditsPerEmailReveal: 1,
  creditsPerPhoneReveal: 1,
  lastTestAt: null,
  lastTestStatus: null,
  lastTestError: null,
  lastTestLatencyMs: null,
  updatedAt: new Date().toISOString(),
};

const DEFAULT_USAGE: ApolloUsageDTO = {
  today: { queries: 0, emailReveals: 0, phoneReveals: 0, cacheHits: 0 },
  last7d: { queries: 0, emailReveals: 0, phoneReveals: 0, cacheHits: 0 },
};

const DEFAULT_ANALYTICS: ApolloCreditAnalyticsDTO = {
  lifetime: {
    emailCredits: 0,
    phoneCredits: 0,
    refundCredits: 0,
    emailReveals: 0,
    phoneReveals: 0,
    refunds: 0,
    totalCreditsSpent: 0,
    netCredits: 0,
    costEstimateUsd: 0,
  },
  series: [],
  topWorkspaces: [],
};

async function loadApolloData(): Promise<{
  settings: ApolloSettingsDTO;
  usage: ApolloUsageDTO;
  analytics: ApolloCreditAnalyticsDTO;
  loadError: string | null;
}> {
  const cookieHeader = cookies().toString();
  let settings = DEFAULT_SETTINGS;
  let usage = DEFAULT_USAGE;
  let analytics = DEFAULT_ANALYTICS;
  let loadError: string | null = null;

  try {
    const [settingsRes, usageRes, analyticsRes] = await Promise.all([
      fetch(`${apiUrl}/api/admin/apollo/settings`, { headers: { Cookie: cookieHeader }, cache: "no-store" }),
      fetch(`${apiUrl}/api/admin/apollo/usage`, { headers: { Cookie: cookieHeader }, cache: "no-store" }),
      fetch(`${apiUrl}/api/admin/apollo/credit-analytics`, { headers: { Cookie: cookieHeader }, cache: "no-store" }),
    ]);

    if (settingsRes.ok) {
      settings = ((await settingsRes.json()) as { data: ApolloSettingsDTO }).data;
    } else {
      loadError = `Settings endpoint returned ${settingsRes.status}. The server may not yet be restarted with the Apollo routes, or the database migration may not have been applied.`;
    }
    if (usageRes.ok) {
      usage = ((await usageRes.json()) as { data: ApolloUsageDTO }).data;
    }
    if (analyticsRes.ok) {
      analytics = ((await analyticsRes.json()) as { data: ApolloCreditAnalyticsDTO }).data;
    }
  } catch (error) {
    loadError = `Unable to reach API server: ${(error as Error).message}`;
  }

  return { settings, usage, analytics, loadError };
}

export default async function AdminApolloPage() {
  const session = await getServerSession();
  if (!session?.user.isSuperAdmin) {
    notFound();
  }

  const { settings, usage, analytics, loadError } = await loadApolloData();

  return (
    <ApolloDataSourceAdmin
      initialSettings={settings}
      initialUsage={usage}
      initialAnalytics={analytics}
      loadError={loadError}
    />
  );
}

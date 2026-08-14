import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { apiUrl, getServerSession } from "@/lib/api";
import { UsersAdmin } from "@/components/admin/UsersAdmin";

export type BillingPlanKey = "STARTER" | "PRO" | "BUSINESS" | "ENTERPRISE";
export type BillingStatusKey = "ACTIVE" | "PAST_DUE" | "CANCELED" | "TRIALING";

export type AdminUserWorkspace = {
  id: string;
  name: string;
  slug: string;
  plan: BillingPlanKey;
  billingStatus: BillingStatusKey;
  creditBalance: number;
  countryLimit: number;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  onboardedAt: string | null;
  ownerId: string;
  paymentProvider: "STRIPE" | "RAZORPAY" | "MANUAL" | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  isOwner: boolean;
};

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  emailVerified: string | null;
  isSuperAdmin: boolean;
  bannedAt: string | null;
  mfaEnabled: boolean;
  lastActiveAt: string | null;
  createdAt: string;
  workspaces: AdminUserWorkspace[];
  primaryWorkspace: AdminUserWorkspace | null;
  totalPaidCents: number;
  paymentCount: number;
  lastPaidAt: string | null;
};

export type AdminUsersSummary = {
  total: number;
  banned: number;
  admins: number;
  onboarded: number;
  unonboarded: number;
  subscribed: number;
  trialing: number;
};

export type AdminUsersListDTO = {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: AdminUsersSummary;
};

export type AdminUserDetailDTO = {
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    emailVerified: string | null;
    isSuperAdmin: boolean;
    bannedAt: string | null;
    mfaEnabled: boolean;
    lastActiveAt: string | null;
    createdAt: string;
    defaultWorkspaceId: string | null;
  };
  workspaces: (AdminUserWorkspace & {
    companyType: string;
    vesselLimit: number;
    emailLimit: number;
    inboxLimit: number;
    teamLimit: number;
    allowedCountries: string[];
    downgradedAt: string | null;
    joinedAt: string;
    createdAt: string;
    _count: { members: number; vessels: number; contacts: number; campaigns: number };
  })[];
  payments: {
    id: string;
    workspaceId: string;
    provider: "STRIPE" | "RAZORPAY" | "MANUAL";
    status: "CREATED" | "PAID" | "FAILED" | "CANCELED" | "REFUNDED";
    purpose: "PLAN" | "CREDITS" | "PAYMENT_LINK";
    amountCents: number;
    currency: string;
    grantPlan: BillingPlanKey | null;
    grantCredits: number | null;
    periodDays: number | null;
    failureReason: string | null;
    paidAt: string | null;
    createdAt: string;
  }[];
  creditLedger: {
    id: string;
    workspaceId: string;
    delta: number;
    balance: number;
    reason: string;
    detail: string | null;
    createdAt: string;
    actor: { id: string; name: string | null; email: string } | null;
  }[];
  paymentLinks: {
    id: string;
    status: "PENDING" | "PAID" | "CANCELED";
    kind: "STRIPE" | "RAZORPAY" | "MANUAL";
    description: string | null;
    amountCents: number;
    currency: string;
    url: string;
    createdAt: string;
    paidAt: string | null;
  }[];
  auditLog: {
    id: string;
    action: string;
    detail: Record<string, unknown> | null;
    createdAt: string;
    actor: { id: string; name: string | null; email: string } | null;
  }[];
};

async function loadUsers(): Promise<AdminUsersListDTO | null> {
  const cookieHeader = cookies().toString();
  const res = await fetch(`${apiUrl}/api/admin/users?page=1&pageSize=25`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { data: AdminUsersListDTO };
  return payload.data;
}

export default async function AdminUsersPage() {
  const session = await getServerSession();
  if (!session?.user.isSuperAdmin) {
    notFound();
  }

  const initial = await loadUsers();
  if (!initial) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
        Failed to load users. Make sure the API server is running.
      </div>
    );
  }

  return <UsersAdmin initial={initial} currentUserId={session.user.id} />;
}

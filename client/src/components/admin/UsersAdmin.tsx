"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Coins,
  CreditCard,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import { cn } from "@/lib/cn";
import type {
  AdminUserDetailDTO,
  AdminUsersListDTO,
  AdminUserWorkspace,
  BillingPlanKey,
  BillingStatusKey,
} from "@/app/dashboard/admin/users/page";

const TABS = [
  { key: "all", label: "All users", countKey: "total" },
  { key: "subscribed", label: "Subscribers", countKey: "subscribed" },
  { key: "trialing", label: "On trial", countKey: "trialing" },
  { key: "onboarded", label: "Onboarded", countKey: "onboarded" },
  { key: "unonboarded", label: "Not onboarded", countKey: "unonboarded" },
  { key: "banned", label: "Suspended", countKey: "banned" },
  { key: "admins", label: "Admins", countKey: "admins" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const PLAN_LABEL: Record<BillingPlanKey, string> = {
  STARTER: "Starter",
  PRO: "Pro",
  BUSINESS: "Fleet",
  ENTERPRISE: "Enterprise",
};

const PLAN_CLASS: Record<BillingPlanKey, string> = {
  STARTER: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/70",
  PRO: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  BUSINESS: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-200",
  ENTERPRISE: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
};

const STATUS_CLASS: Record<BillingStatusKey, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  TRIALING: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  PAST_DUE: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
  CANCELED: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200",
};

function money(cents: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
}

function date(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function relative(value: string | null | undefined) {
  if (!value) return "Never";
  const diffMs = Date.now() - new Date(value).getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * The platform's people directory.
 *
 * Everything an admin needs about a customer in one table — signup, onboarding,
 * plan, credits, money paid — with the two manual levers (grant a subscription,
 * grant credits) plus suspension available per row. Every action here is
 * audited server-side.
 */
export function UsersAdmin({ initial, currentUserId }: { initial: AdminUsersListDTO; currentUserId: string }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      const params = new URLSearchParams({ tab, page: String(page), pageSize: "25" });
      if (debouncedSearch) params.set("query", debouncedSearch);
      try {
        const res = await apiFetch(`/api/admin/users?${params.toString()}`);
        if (!res.ok) {
          setError("Could not load users.");
          return;
        }
        const payload = (await res.json()) as { data: AdminUsersListDTO };
        setData(payload.data);
      } catch {
        setError("Could not reach the API server.");
      } finally {
        setLoading(false);
      }
    },
    [tab, page, debouncedSearch],
  );

  // Skip the very first run — the server component already delivered page 1.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (!hydrated) {
      setHydrated(true);
      return;
    }
    void load();
  }, [load, hydrated]);

  useEffect(() => {
    setPage(1);
  }, [tab, debouncedSearch]);

  const pageCount = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ocean">User Management</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-950 dark:text-white">
              <Users className="h-6 w-6 text-ocean" />
              All users
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-white/60">
              Everyone onboarded on the platform, what they are paying for, and their credit balance. Grant a
              subscription or top up credits manually from any row — every action is recorded in the audit log.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-white/80 dark:hover:bg-white/5"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total users" value={data.summary.total} />
          <Stat label="Paying" value={data.summary.subscribed} tone="emerald" />
          <Stat label="On trial" value={data.summary.trialing} tone="sky" />
          <Stat label="Suspended" value={data.summary.banned} tone="rose" />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 pt-4 dark:border-white/[0.08]">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition",
                tab === t.key
                  ? "border-ocean text-ocean"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-white/50 dark:hover:text-white/80",
              )}
            >
              {t.label}
              <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-white/10 dark:text-white/60">
                {data.summary[t.countKey]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email or workspace…"
              className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-ocean dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-white/50">
            {data.total} {data.total === 1 ? "user" : "users"}
          </p>
        </div>

        {error && (
          <div className="mx-4 mb-3 flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-y border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-white/50">
              <tr>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Workspace</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium text-right">Credits</th>
                <th className="px-4 py-2 font-medium text-right">Paid</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2 font-medium">Last active</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {data.users.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-white/50">
                    No users match this view.
                  </td>
                </tr>
              )}
              {data.users.map((user) => {
                const ws = user.primaryWorkspace;
                return (
                  <tr
                    key={user.id}
                    className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                    onClick={() => setSelectedId(user.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{user.name ?? "—"}</p>
                          <p className="text-xs text-slate-500 dark:text-white/50">{user.email}</p>
                        </div>
                        {user.isSuperAdmin && (
                          <ShieldCheck className="h-4 w-4 flex-shrink-0 text-ocean" aria-label="Super admin" />
                        )}
                        {user.bannedAt && (
                          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-200">
                            Suspended
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-slate-800 dark:text-white/80">{ws?.name ?? "—"}</p>
                      <p className="text-xs text-slate-500 dark:text-white/50">
                        {ws ? (ws.onboardedAt ? "Onboarded" : "Not onboarded") : "No workspace"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {ws ? (
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", PLAN_CLASS[ws.plan])}>
                          {PLAN_LABEL[ws.plan]}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {ws ? (
                        <span
                          className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_CLASS[ws.billingStatus])}
                        >
                          {ws.billingStatus.replace("_", " ").toLowerCase()}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800 dark:text-white/80">
                      {ws ? ws.creditBalance.toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-800 dark:text-white/80">
                      {user.totalPaidCents > 0 ? money(user.totalPaidCents) : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-white/60">{date(user.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-white/60">{relative(user.lastActiveAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(user.id);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
                      >
                        <UserCog className="h-3.5 w-3.5" />
                        Manage
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm dark:border-white/[0.08]">
            <p className="text-slate-500 dark:text-white/50">
              Page {data.page} of {pageCount}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-white/10 dark:text-white/80"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-white/10 dark:text-white/80"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {selectedId && (
        <UserDetailPanel
          userId={selectedId}
          currentUserId={currentUserId}
          onClose={() => setSelectedId(null)}
          onChanged={() => void load({ silent: true })}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone = "slate" }: { label: string; value: number; tone?: "slate" | "emerald" | "sky" | "rose" }) {
  const toneClass = {
    slate: "text-slate-900 dark:text-white",
    emerald: "text-emerald-600 dark:text-emerald-300",
    sky: "text-sky-600 dark:text-sky-300",
    rose: "text-rose-600 dark:text-rose-300",
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/[0.08] dark:bg-white/[0.02]">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-white/50">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>{value.toLocaleString()}</p>
    </div>
  );
}

// --- Detail panel ----------------------------------------------------------

const PLAN_KEYS: BillingPlanKey[] = ["STARTER", "PRO", "BUSINESS", "ENTERPRISE"];
const STATUS_KEYS: BillingStatusKey[] = ["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED"];

function UserDetailPanel({
  userId,
  currentUserId,
  onClose,
  onChanged,
}: {
  userId: string;
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<AdminUserDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [section, setSection] = useState<"overview" | "billing" | "credits" | "activity">("overview");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/admin/users/${userId}`);
      if (!res.ok) {
        setError("Could not load this user.");
        return;
      }
      const payload = (await res.json()) as { data: AdminUserDetailDTO };
      setDetail(payload.data);
      setWorkspaceId(
        (prev) =>
          prev ??
          payload.data.user.defaultWorkspaceId ??
          payload.data.workspaces.find((w) => w.isOwner)?.id ??
          payload.data.workspaces[0]?.id ??
          null,
      );
    } catch {
      setError("Could not reach the API server.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const workspace = useMemo(
    () => detail?.workspaces.find((w) => w.id === workspaceId) ?? detail?.workspaces[0] ?? null,
    [detail, workspaceId],
  );

  async function act(path: string, body: unknown, successMessage: string) {
    setNotice(null);
    setError(null);
    const res = await apiFetch(`/api/admin/users/${userId}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(payload?.error?.message ?? "The action failed.");
      return false;
    }
    setNotice(successMessage);
    await load();
    onChanged();
    return true;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-200 bg-white shadow-xl dark:border-white/[0.08] dark:bg-[#0a0a0c]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 dark:border-white/[0.08] dark:bg-[#0a0a0c]">
          <div>
            <h2 className="text-lg font-semibold text-slate-950 dark:text-white">
              {detail?.user.name ?? "User"}
              {detail?.user.isSuperAdmin && <span className="ml-2 text-xs font-medium text-ocean">Super admin</span>}
            </h2>
            <p className="text-sm text-slate-500 dark:text-white/50">{detail?.user.email}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && !detail ? (
          <div className="flex items-center justify-center py-20 text-slate-500 dark:text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !detail ? (
          <div className="p-6 text-sm text-rose-600 dark:text-rose-300">{error ?? "User not found."}</div>
        ) : (
          <div className="space-y-6 p-6">
            {(notice || error) && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                  error
                    ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200",
                )}
              >
                {error ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                {error ?? notice}
              </div>
            )}

            {detail.workspaces.length > 1 && (
              <label className="block text-sm">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-white/50">
                  Acting on workspace
                </span>
                <select
                  value={workspace?.id ?? ""}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
                >
                  {detail.workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} — {PLAN_LABEL[w.plan]} {w.isOwner ? "(owner)" : `(${w.role.toLowerCase()})`}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-white/[0.08]">
              {(
                [
                  ["overview", "Overview"],
                  ["billing", "Subscription"],
                  ["credits", "Credits"],
                  ["activity", "Activity"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSection(key)}
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
                    section === key
                      ? "border-ocean text-ocean"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-white/50 dark:hover:text-white/80",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {section === "overview" && <OverviewSection detail={detail} workspace={workspace} />}

            {section === "billing" && workspace && (
              <SubscriptionSection
                workspace={workspace}
                onGrant={(body) =>
                  act("/subscription", { ...body, workspaceId: workspace.id }, "Subscription applied.")
                }
                payments={detail.payments.filter((p) => p.workspaceId === workspace.id)}
              />
            )}

            {section === "credits" && workspace && (
              <CreditsSection
                workspace={workspace}
                ledger={detail.creditLedger.filter((l) => l.workspaceId === workspace.id)}
                onGrant={(body) => act("/credits", { ...body, workspaceId: workspace.id }, "Credit balance updated.")}
              />
            )}

            {section === "activity" && <ActivitySection detail={detail} />}

            <div className="border-t border-slate-200 pt-4 dark:border-white/[0.08]">
              {detail.user.id === currentUserId ? (
                <p className="text-xs text-slate-500 dark:text-white/50">This is your own account.</p>
              ) : detail.user.bannedAt ? (
                <button
                  type="button"
                  onClick={() => void act("/unban", {}, "Account restored.")}
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Restore access
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const reason = window.prompt("Reason for suspending this account (optional)") ?? undefined;
                    void act("/ban", { reason }, "Account suspended.");
                  }}
                  className="inline-flex items-center gap-2 rounded-md border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-950/30"
                >
                  <Ban className="h-4 w-4" />
                  Suspend account
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewSection({
  detail,
  workspace,
}: {
  detail: AdminUserDetailDTO;
  workspace: AdminUserDetailDTO["workspaces"][number] | null;
}) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Field label="Signed up" value={date(detail.user.createdAt)} />
        <Field label="Last active" value={relative(detail.user.lastActiveAt)} />
        <Field label="Email verified" value={detail.user.emailVerified ? date(detail.user.emailVerified) : "No"} />
        <Field label="Two-factor" value={detail.user.mfaEnabled ? "Enabled" : "Off"} />
        <Field label="Account status" value={detail.user.bannedAt ? `Suspended ${date(detail.user.bannedAt)}` : "Active"} />
        <Field label="Workspaces" value={String(detail.workspaces.length)} />
      </dl>

      {workspace && (
        <div className="rounded-lg border border-slate-200 p-4 dark:border-white/[0.08]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-white/50">
            {workspace.name}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Field label="Plan" value={`${PLAN_LABEL[workspace.plan]} · ${workspace.billingStatus.toLowerCase()}`} />
            <Field label="Credits" value={workspace.creditBalance.toLocaleString()} />
            <Field label="Renews / ends" value={date(workspace.currentPeriodEnd)} />
            <Field label="Trial ends" value={date(workspace.trialEndsAt)} />
            <Field label="Onboarded" value={workspace.onboardedAt ? date(workspace.onboardedAt) : "Not yet"} />
            <Field label="Paid via" value={workspace.paymentProvider ?? "—"} />
            <Field label="Seats" value={`${workspace._count.members} / ${workspace.teamLimit}`} />
            <Field label="Countries" value={`${workspace.allowedCountries.length} / ${workspace.countryLimit}`} />
            <Field label="Vessels" value={`${workspace._count.vessels} / ${workspace.vesselLimit}`} />
            <Field label="Contacts" value={workspace._count.contacts.toLocaleString()} />
            <Field label="Campaigns" value={String(workspace._count.campaigns)} />
            <Field label="Role" value={workspace.isOwner ? "Owner" : workspace.role.toLowerCase()} />
          </dl>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500 dark:text-white/50">{label}</dt>
      <dd className="mt-0.5 text-slate-900 dark:text-white/90">{value}</dd>
    </div>
  );
}

function SubscriptionSection({
  workspace,
  payments,
  onGrant,
}: {
  workspace: AdminUserWorkspace;
  payments: AdminUserDetailDTO["payments"];
  onGrant: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [plan, setPlan] = useState<BillingPlanKey>(workspace.plan);
  const [billingStatus, setBillingStatus] = useState<BillingStatusKey>("ACTIVE");
  const [periodDays, setPeriodDays] = useState(30);
  const [replenishCredits, setReplenishCredits] = useState(true);
  const [recordPayment, setRecordPayment] = useState(true);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 p-4 dark:border-white/[0.08]">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <CreditCard className="h-4 w-4 text-ocean" />
          Grant a subscription manually
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
          Applies the plan&apos;s limits and country allowance to <strong>{workspace.name}</strong> immediately, as a
          paid checkout would. Use this for deals closed off-platform.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-white/50">Plan</span>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as BillingPlanKey)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
            >
              {PLAN_KEYS.map((p) => (
                <option key={p} value={p}>
                  {PLAN_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-white/50">
              Billing status
            </span>
            <select
              value={billingStatus}
              onChange={(e) => setBillingStatus(e.target.value as BillingStatusKey)}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
            >
              {STATUS_KEYS.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ").toLowerCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-white/50">
              Access for (days)
            </span>
            <input
              type="number"
              min={1}
              max={3650}
              value={periodDays}
              onChange={(e) => setPeriodDays(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-white/50">
              Amount collected (USD, optional)
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Defaults to list price"
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
            />
          </label>
        </div>

        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2 text-slate-700 dark:text-white/70">
            <input
              type="checkbox"
              checked={replenishCredits}
              onChange={(e) => setReplenishCredits(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Add the plan&apos;s monthly credit allowance
          </label>
          <label className="flex items-center gap-2 text-slate-700 dark:text-white/70">
            <input
              type="checkbox"
              checked={recordPayment}
              onChange={(e) => setRecordPayment(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Record it as a manual payment in billing history
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note for the audit log (optional)"
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
          />
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            const amountCents = amount.trim() ? Math.round(Number(amount) * 100) : undefined;
            await onGrant({
              plan,
              billingStatus,
              periodDays,
              replenishCredits,
              recordPayment,
              ...(amountCents !== undefined && Number.isFinite(amountCents) ? { amountCents } : {}),
              ...(note.trim() ? { note: note.trim() } : {}),
            });
            setSaving(false);
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-ocean px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          Apply subscription
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Payment history</h3>
        {payments.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-white/50">No payments recorded yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-white/[0.06]">
            {payments.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-slate-900 dark:text-white/90">
                    {money(p.amountCents, p.currency)} · {p.purpose.toLowerCase()}
                    {p.grantPlan ? ` · ${PLAN_LABEL[p.grantPlan]}` : ""}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-white/50">
                    {p.provider.toLowerCase()} · {date(p.paidAt ?? p.createdAt)}
                    {p.failureReason ? ` · ${p.failureReason}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    p.status === "PAID"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                      : p.status === "FAILED"
                        ? "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
                        : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/70",
                  )}
                >
                  {p.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CreditsSection({
  workspace,
  ledger,
  onGrant,
}: {
  workspace: AdminUserWorkspace;
  ledger: AdminUserDetailDTO["creditLedger"];
  onGrant: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [credits, setCredits] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const amount = Number(credits);
  const valid = credits.trim() !== "" && Number.isInteger(amount) && amount !== 0;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 p-4 dark:border-white/[0.08]">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <Coins className="h-4 w-4 text-ocean" />
          Adjust credits
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
          Current balance for <strong>{workspace.name}</strong>: {workspace.creditBalance.toLocaleString()} credits.
          Enter a negative number to deduct.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {[100, 500, 1000, 5000].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setCredits(String(preset))}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:text-white/70 dark:hover:bg-white/5"
            >
              +{preset.toLocaleString()}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input
            type="number"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            placeholder="Credits to add or remove"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason (optional)"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03] dark:text-white"
          />
        </div>

        <button
          type="button"
          disabled={!valid || saving}
          onClick={async () => {
            setSaving(true);
            await onGrant({ credits: amount, ...(note.trim() ? { note: note.trim() } : {}) });
            setCredits("");
            setNote("");
            setSaving(false);
          }}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-ocean px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
          {amount < 0 ? "Deduct credits" : "Grant credits"}
        </button>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Credit ledger</h3>
        {ledger.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-white/50">No credit movement yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-white/[0.06]">
            {ledger.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-slate-900 dark:text-white/90">
                    {entry.reason.replace(/_/g, " ").toLowerCase()}
                    {entry.detail ? ` · ${entry.detail}` : ""}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-white/50">
                    {date(entry.createdAt)}
                    {entry.actor ? ` · by ${entry.actor.name ?? entry.actor.email}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "font-medium tabular-nums",
                      entry.delta >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300",
                    )}
                  >
                    {entry.delta > 0 ? "+" : ""}
                    {entry.delta.toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-white/50">{entry.balance.toLocaleString()} left</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ActivitySection({ detail }: { detail: AdminUserDetailDTO }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Admin actions on this account</h3>
        {detail.auditLog.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-white/50">No admin actions recorded.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-white/[0.06]">
            {detail.auditLog.map((entry) => (
              <li key={entry.id} className="py-2">
                <p className="text-slate-900 dark:text-white/90">{entry.action.replace(/_/g, " ").toLowerCase()}</p>
                <p className="text-xs text-slate-500 dark:text-white/50">
                  {date(entry.createdAt)}
                  {entry.actor ? ` · ${entry.actor.name ?? entry.actor.email}` : ""}
                </p>
                {entry.detail && (
                  <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-[11px] text-slate-600 dark:bg-white/[0.03] dark:text-white/60">
                    {JSON.stringify(entry.detail, null, 2)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Payment links</h3>
        {detail.paymentLinks.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-white/50">No payment links issued.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm dark:divide-white/[0.06]">
            {detail.paymentLinks.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <p className="text-slate-900 dark:text-white/90">
                    {money(link.amountCents, link.currency.toUpperCase())} · {link.description ?? link.kind}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-white/50">{date(link.createdAt)}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-white/10 dark:text-white/70">
                  {link.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

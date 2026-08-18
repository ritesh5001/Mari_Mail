import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { apiUrl, getServerSession } from "@/lib/api";
import { AccountsPanel, type ApolloAccountDTO } from "./AccountsPanel";

export const dynamic = "force-dynamic";

async function loadAccounts(): Promise<{ accounts: ApolloAccountDTO[]; loadError: string | null }> {
  try {
    const res = await fetch(`${apiUrl}/api/admin/apollo-accounts`, {
      headers: { Cookie: cookies().toString() },
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        accounts: [],
        loadError: `Accounts endpoint returned ${res.status}. The server may not be restarted with these routes yet, or the migration may not have been applied.`,
      };
    }
    const payload = (await res.json()) as { data: { accounts: ApolloAccountDTO[] } };
    return { accounts: payload.data.accounts, loadError: null };
  } catch (error) {
    return { accounts: [], loadError: `Unable to reach API server: ${(error as Error).message}` };
  }
}

export default async function AdminApolloAccountsPage() {
  const session = await getServerSession();
  if (!session?.user.isSuperAdmin) redirect("/dashboard");

  const { accounts, loadError } = await loadAccounts();

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
          Your provider accounts
        </h1>
      </div>

      {loadError ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">
          {loadError}
        </p>
      ) : null}

      <AccountsPanel initial={accounts} />
    </div>
  );
}

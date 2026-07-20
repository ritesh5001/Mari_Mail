import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { apiUrl, getServerSession } from "@/lib/api";
import { UnlockedApolloContacts } from "@/components/admin/UnlockedApolloContacts";

export type UnlockedContactDTO = {
  id: string;
  apolloId: string;
  firstName: string;
  lastName: string;
  fullName: string | null;
  title: string | null;
  companyName: string;
  companyDomain: string | null;
  email: string | null;
  emailStatus: string | null;
  mobilePhone: string | null;
  personLinkedinUrl: string | null;
  country: string | null;
  seniority: string;
  emailRevealedAt: string | null;
  phoneRevealedAt: string | null;
  firstRevealedWorkspaceId: string | null;
  firstRevealedWorkspaceName: string | null;
  reuseCount: number;
  createdAt: string;
  updatedAt: string;
};

async function loadInitialUnlocked(): Promise<{
  rows: UnlockedContactDTO[];
  total: number;
  nextCursor: string | null;
  loadError: string | null;
}> {
  const cookieHeader = cookies().toString();
  try {
    const response = await fetch(`${apiUrl}/api/admin/apollo/unlocked?limit=50`, {
      headers: { Cookie: cookieHeader },
      cache: "no-store",
    });
    if (!response.ok) {
      return { rows: [], total: 0, nextCursor: null, loadError: `Server returned ${response.status}` };
    }
    const payload = (await response.json()) as {
      data: { rows: UnlockedContactDTO[]; total: number; nextCursor: string | null };
    };
    return {
      rows: payload.data.rows,
      total: payload.data.total,
      nextCursor: payload.data.nextCursor,
      loadError: null,
    };
  } catch (error) {
    return {
      rows: [],
      total: 0,
      nextCursor: null,
      loadError: `Unable to reach API server: ${(error as Error).message}`,
    };
  }
}

export default async function AdminApolloUnlockedPage() {
  const session = await getServerSession();
  if (!session?.user.isSuperAdmin) {
    notFound();
  }

  const { rows, total, nextCursor, loadError } = await loadInitialUnlocked();

  return (
    <UnlockedApolloContacts
      initialRows={rows}
      initialTotal={total}
      initialNextCursor={nextCursor}
      loadError={loadError}
    />
  );
}

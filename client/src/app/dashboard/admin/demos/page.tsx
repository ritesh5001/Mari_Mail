import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { apiUrl, getServerSession } from "@/lib/api";
import { DemoBookingsAdmin } from "@/components/admin/DemoBookingsAdmin";

type DemoBookingDTO = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  phone: string | null;
  role: string | null;
  fleetSize: string | null;
  message: string | null;
  preferredAt: string | null;
  timezone: string | null;
  status: "PENDING" | "CONTACTED" | "SCHEDULED" | "COMPLETED" | "CANCELLED";
  notes: string | null;
  source: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
};

type DemoSettingsDTO = {
  id: string;
  enabled: boolean;
  registrationEnabled: boolean;
  adminEmail: string | null;
  successMessage: string;
  updatedAt: string;
};

async function loadDemoData() {
  const cookieHeader = cookies().toString();
  const [bookingsRes, settingsRes] = await Promise.all([
    fetch(`${apiUrl}/api/demo`, { headers: { Cookie: cookieHeader }, cache: "no-store" }),
    fetch(`${apiUrl}/api/demo/settings`, { headers: { Cookie: cookieHeader }, cache: "no-store" }),
  ]);

  if (!bookingsRes.ok || !settingsRes.ok) {
    return null;
  }

  const bookingsPayload = (await bookingsRes.json()) as {
    data: { bookings: DemoBookingDTO[]; summary: Record<string, number> };
  };
  const settingsPayload = (await settingsRes.json()) as { data: DemoSettingsDTO };

  return {
    bookings: bookingsPayload.data.bookings,
    summary: bookingsPayload.data.summary,
    settings: settingsPayload.data,
  };
}

export default async function AdminDemosPage() {
  const session = await getServerSession();
  if (!session?.user.isSuperAdmin) {
    notFound();
  }

  const data = await loadDemoData();
  if (!data) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
        Failed to load demo bookings. Make sure the API server is running.
      </div>
    );
  }

  return (
    <DemoBookingsAdmin
      initialBookings={data.bookings}
      initialSettings={data.settings}
      initialSummary={data.summary}
    />
  );
}

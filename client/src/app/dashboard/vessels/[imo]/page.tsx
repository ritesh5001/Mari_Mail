import { VesselDetail } from "@/components/marine/VesselDetail";
import { getVesselByImo } from "@/lib/marine-data";
import { listMarineVesselContacts, toMarineVesselContactView } from "@/lib/marine-row-data";
import { getServerSession } from "@/lib/api";

export default async function VesselDetailPage({ params }: { params: { imo: string } }) {
  const [vessel, session] = await Promise.all([
    getVesselByImo(params.imo),
    getServerSession(),
  ]);
  const associatedContacts = await listMarineVesselContacts(vessel.id);
  return (
    <VesselDetail
      vessel={vessel}
      associatedContacts={(associatedContacts?.rows ?? []).map(toMarineVesselContactView)}
      isSuperAdmin={session?.user.isSuperAdmin ?? false}
    />
  );
}

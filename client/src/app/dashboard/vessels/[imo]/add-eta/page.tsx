import { notFound } from "next/navigation";
import { AddEtaForm } from "@/components/marine/AddEtaForm";
import { listPorts } from "@/lib/eta-data";
import { getVesselByImo } from "@/lib/marine-data";

export const dynamic = "force-dynamic";

export default async function AddEtaPage({ params }: { params: { imo: string } }) {
  const vessel = await getVesselByImo(params.imo);
  if (!vessel) notFound();
  const ports = await listPorts();
  return <AddEtaForm vessel={vessel} ports={ports} />;
}

import { CompanyDetail } from "@/components/marine/CompanyDetail";
import { getCompanyDetail } from "@/lib/marine-data";

export default async function ShipOwnerPage({ params }: { params: { id: string } }) {
  const { company, vessels } = await getCompanyDetail("ship-owners", params.id);
  return <CompanyDetail company={company} vessels={vessels} />;
}

import { CompanyDetail } from "@/components/marine/CompanyDetail";
import { getCompanyDetail } from "@/lib/marine-data";

export default async function CommercialManagerPage({ params }: { params: { id: string } }) {
  const { company, vessels } = await getCompanyDetail("commercial-managers", params.id);
  return <CompanyDetail company={company} vessels={vessels} />;
}

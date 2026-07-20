import { CompanyDetail } from "@/components/marine/CompanyDetail";
import { getCompanyDetail } from "@/lib/marine-data";

export default async function ISMManagerPage({ params }: { params: { id: string } }) {
  const { company, vessels } = await getCompanyDetail("ism-managers", params.id);
  return <CompanyDetail company={company} vessels={vessels} />;
}

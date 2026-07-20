import { notFound } from "next/navigation";
import { getCampaignDetailData } from "@/lib/campaign-data";
import { CampaignEditor } from "@/components/campaigns/CampaignEditor";
import { listContactLists } from "@/lib/contact-data";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const [data, lists] = await Promise.all([
    getCampaignDetailData(params.id),
    listContactLists(),
  ]);
  if (!data) notFound();

  return (
    <CampaignEditor
      campaign={data.campaign}
      targetContacts={data.targetContacts}
      targetLists={data.targetLists}
      targetVessels={data.targetVessels}
      stagedGroups={data.stagedGroups}
      lists={lists}
      initialTab={searchParams.tab ?? "leads"}
    />
  );
}

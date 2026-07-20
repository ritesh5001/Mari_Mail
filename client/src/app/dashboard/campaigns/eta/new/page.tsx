import { NewCampaignForm } from "@/components/campaigns/NewCampaignForm";

export const dynamic = "force-dynamic";

export default function NewEtaCampaignPage() {
  return (
    <NewCampaignForm
      triggerType="ETA_BASED"
      kindLabel="ETA campaign"
      backHref="/dashboard/campaigns/eta"
    />
  );
}

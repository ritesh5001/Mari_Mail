import { NewCampaignForm } from "@/components/campaigns/NewCampaignForm";

export const dynamic = "force-dynamic";

export default function NewColdCampaignPage() {
  return (
    <NewCampaignForm
      triggerType="MANUAL"
      kindLabel="cold campaign"
      backHref="/dashboard/campaigns/cold"
    />
  );
}

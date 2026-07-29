import { NoInboxWarning } from "@/components/campaigns/NoInboxWarning";
import { NewCampaignForm } from "@/components/campaigns/NewCampaignForm";

export const dynamic = "force-dynamic";

export default function NewColdCampaignPage() {
  return (
    // The builder is long; flagging the blocker here saves filling it all
    // in only to be rejected on submit.
    <div className="space-y-6">
      <NoInboxWarning />
      <NewCampaignForm
        triggerType="MANUAL"
        kindLabel="cold campaign"
        backHref="/dashboard/campaigns/cold"
      />
    </div>
  );
}

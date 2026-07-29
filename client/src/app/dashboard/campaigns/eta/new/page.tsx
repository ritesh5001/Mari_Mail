import { NoInboxWarning } from "@/components/campaigns/NoInboxWarning";
import { NewCampaignForm } from "@/components/campaigns/NewCampaignForm";

export const dynamic = "force-dynamic";

export default function NewEtaCampaignPage() {
  return (
    // The builder is long; flagging the blocker here saves filling it all
    // in only to be rejected on submit.
    <div className="space-y-6">
      <NoInboxWarning />
      <NewCampaignForm
        triggerType="ETA_BASED"
        kindLabel="ETA campaign"
        backHref="/dashboard/campaigns/eta"
      />
    </div>
  );
}

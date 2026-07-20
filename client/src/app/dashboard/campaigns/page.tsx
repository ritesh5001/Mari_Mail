import { redirect } from "next/navigation";

export default function CampaignsIndex() {
  redirect("/dashboard/campaigns/cold");
}

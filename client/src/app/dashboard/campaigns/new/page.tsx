import { redirect } from "next/navigation";

export default function NewCampaignIndex() {
  redirect("/dashboard/campaigns/cold/new");
}

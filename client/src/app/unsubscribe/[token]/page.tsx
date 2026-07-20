import { UnsubscribeClient } from "@/components/campaigns/UnsubscribeClient";

export default function UnsubscribePage({ params }: { params: { token: string } }) {
  return <UnsubscribeClient token={params.token} />;
}

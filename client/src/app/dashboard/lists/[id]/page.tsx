import { ContactListDetail } from "@/components/lists/ListViews";
import { getContactListDetail } from "@/lib/contact-data";
import { getServerSession } from "@/lib/api";

export default async function ContactListPage({ params }: { params: { id: string } }) {
  const [data, session] = await Promise.all([
    getContactListDetail(params.id),
    getServerSession(),
  ]);
  return (
    <div className="space-y-4">
      <ContactListDetail
        list={data.list}
        companies={data.companies}
        contacts={data.contacts}
        vessels={data.vessels}
        activity={data.activity}
        isSuperAdmin={session?.user.isSuperAdmin ?? false}
      />
    </div>
  );
}

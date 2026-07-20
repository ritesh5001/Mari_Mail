import { ContactListDetail } from "@/components/lists/ListViews";
import { getContactListDetail } from "@/lib/contact-data";

export default async function ContactListPage({ params }: { params: { id: string } }) {
  const data = await getContactListDetail(params.id);
  return (
    <div className="space-y-4">
      <ContactListDetail
        list={data.list}
        companies={data.companies}
        contacts={data.contacts}
        vessels={data.vessels}
        activity={data.activity}
      />
    </div>
  );
}

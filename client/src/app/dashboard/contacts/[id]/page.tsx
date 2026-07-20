import { ContactDetail } from "@/components/contacts/ContactDetail";
import { getContactDetail } from "@/lib/contact-data";

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  const { contact, vessels } = await getContactDetail(params.id);
  return <ContactDetail contact={contact} vessels={vessels} />;
}

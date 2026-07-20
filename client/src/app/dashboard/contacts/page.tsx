import { ContactFinder } from "@/components/contacts/ContactFinder";
import { AddContactButton } from "@/components/contacts/AddContactButton";

export default function ContactsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-950 dark:text-white">People</h1>
        <AddContactButton />
      </div>
      <ContactFinder />
    </div>
  );
}

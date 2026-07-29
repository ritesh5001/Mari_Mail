import { ContactFinder } from "@/components/contacts/ContactFinder";
import { AddContactButton } from "@/components/contacts/AddContactButton";

export default function ContactsPage() {
  return (
    <div className="space-y-4">
      {/* Single page title. The nav item, the breadcrumb and this heading all
          say "Contacts" now — it used to be Contacts / People / "N contacts
          match your filters", three names for one screen. */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-950 dark:text-white">Contacts</h1>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-white/55">
            Search, filter and enrich people across your vessels&rsquo; owner and manager companies.
          </p>
        </div>
        <AddContactButton />
      </div>
      <ContactFinder />
    </div>
  );
}

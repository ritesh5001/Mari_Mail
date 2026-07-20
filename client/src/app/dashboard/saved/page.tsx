import { listSavedContacts } from "@/lib/contact-data";
import { SavedContactsView } from "@/components/contacts/SavedContactsView";
import { LaunchCampaignFromSaved } from "@/components/campaigns/LaunchCampaignButton";

export const dynamic = "force-dynamic";

export default async function SavedPage() {
  const contacts = await listSavedContacts();

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-ocean">Saved Contacts</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950 dark:text-white">
            {contacts.length.toLocaleString("en")} saved {contacts.length === 1 ? "contact" : "contacts"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-white/55">
            Your private bookmarks. Only you can see these. Launch a campaign straight from here.
          </p>
        </div>
        {contacts.length > 0 && (
          <LaunchCampaignFromSaved contactIds={contacts.map((c) => c.id)} count={contacts.length} />
        )}
      </section>

      <SavedContactsView contacts={contacts} />
    </div>
  );
}

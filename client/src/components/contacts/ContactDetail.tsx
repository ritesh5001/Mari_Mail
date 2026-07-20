import { Building2, Home, Linkedin, Phone, Smartphone } from "lucide-react";
import Link from "next/link";
import type { ContactModel } from "@/lib/contact-data";
import { formatEnum } from "@/lib/contact-data";
import { CONTACT_SCHEMA_FIELDS, contactFieldValue } from "@/lib/contact-schema";
import type { AssociatedVesselView } from "@/lib/marine-row-views";

export function ContactDetail({ contact, vessels }: { contact: ContactModel; vessels: AssociatedVesselView[] }) {
  const schemaGroups = ["Identity", "Company", "Communication", "Digital", "CRM"];

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-navy text-xl font-semibold text-white">
              {contact.firstName.slice(0, 1)}
              {contact.lastName.slice(0, 1)}
            </div>
            <div>
              <h2 className="text-3xl font-semibold text-slate-950">{contact.firstName} {contact.lastName}</h2>
              <p className="mt-1 text-sm text-slate-600">{contact.title ?? "No title"} at {contact.companyName}</p>
              <button className="mt-3 rounded-md bg-ocean/10 px-3 py-2 text-sm font-semibold text-ocean">{contact.email}</button>
              {contact.secondaryEmail ? <p className="mt-2 text-sm text-slate-500">Secondary: {contact.secondaryEmail}</p> : null}
            </div>
          </div>
          <span className="w-fit rounded-md bg-gold/10 px-3 py-2 text-sm font-semibold text-navy">Score {contact.engagementScore}</span>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <Info icon={<Smartphone className="h-4 w-4" />} label="Mobile" value={contact.mobilePhone} />
          <Info icon={<Building2 className="h-4 w-4" />} label="Corporate" value={contact.corporatePhone} />
          <Info icon={<Home className="h-4 w-4" />} label="Home" value={contact.homePhone} />
          <Info icon={<Phone className="h-4 w-4" />} label="Other" value={contact.otherPhone} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {contact.personLinkedinUrl ? <a className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 font-semibold text-ocean" href={contact.personLinkedinUrl}><Linkedin className="h-4 w-4" />Person LinkedIn</a> : null}
          {contact.companyLinkedinUrl ? <a className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 font-semibold text-ocean" href={contact.companyLinkedinUrl}><Linkedin className="h-4 w-4" />Company LinkedIn</a> : null}
          {contact.website ? <a className="rounded-md border border-slate-200 px-3 py-2 font-semibold text-ocean" href={contact.website}>Website</a> : null}
          {contact.subsidiaryOf ? <span className="rounded-md bg-slate-100 px-3 py-2 font-semibold text-slate-700">Subsidiary of {contact.subsidiaryOf}</span> : null}
          {contact.salesforceId ? <span className="rounded-md bg-blue-50 px-3 py-2 font-semibold text-ocean">Salesforce {contact.salesforceId}</span> : null}
        </div>
      </section>
      {schemaGroups.map((group) => (
        <section key={group} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{group}</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            {CONTACT_SCHEMA_FIELDS.filter((field) => field.group === group).map((field) => (
              <div key={field.label} className="min-w-0 rounded-md bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{field.label}</p>
                <p className="mt-1 truncate text-sm font-semibold text-slate-950" title={contactFieldValue(contact, field)}>
                  {contactFieldValue(contact, field)}
                </p>
              </div>
            ))}
          </div>
        </section>
      ))}
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 text-sm font-semibold text-slate-600">
          {["Profile", "Vessels", "Activity", "Campaigns", "Notes"].map((tab) => (
            <button key={tab} className={tab === "Vessels" ? "rounded-md bg-navy px-3 py-2 text-white" : "rounded-md px-3 py-2 hover:bg-slate-100"}>{tab}</button>
          ))}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {vessels.map((vessel) => {
            const roles = vessel.matchedCompanies.map((company) => company.role).join(", ") || vessel.matchedRole;
            return (
            <Link key={vessel.vesselId} href={`/dashboard/vessels/${vessel.imoNumber}`} className="rounded-lg border border-slate-200 p-4 hover:border-ocean">
              <p className="font-semibold text-slate-950">{vessel.vesselName}</p>
              <p className="mt-1 text-sm text-slate-500">IMO {vessel.imoNumber} | {vessel.flag ?? "-"} | {formatEnum(vessel.vesselType)}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <span>DWT {vessel.dwt?.toLocaleString("en") ?? "-"}</span>
                <span>Port {vessel.currentPortUnlocode ?? "-"}</span>
                <span>Commercial {vessel.commercialManagerName ?? "-"}</span>
                <span>ISM {vessel.ismManagerName ?? "-"}</span>
                <span className="col-span-2">Operator {vessel.operatorName ?? "-"}</span>
              </div>
              <div className="mt-3 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">{vessel.confidence} match · {vessel.matchedSource}</p>
                <p className="mt-1 truncate" title={vessel.matchedValue}>Value: {vessel.matchedValue}</p>
                <p className="mt-1 truncate" title={roles}>Role: {roles}</p>
              </div>
            </Link>
            );
          })}
          {vessels.length === 0 ? <p className="text-sm text-slate-500">No vessels linked through this contact company yet.</p> : null}
        </div>
      </section>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{icon}{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value ?? "-"}</p>
    </div>
  );
}

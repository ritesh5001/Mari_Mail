import Link from "next/link";
import type { VesselWithEtas } from "@/lib/marine-data";
import { formatEnum } from "@/lib/marine-data";
import { VESSEL_SCHEMA_FIELDS, vesselFieldValue } from "@/lib/vessel-schema";
import type { MarineVesselContactView } from "@/lib/marine-row-views";
import { EditVesselButton } from "@/components/marine/EditVesselButton";
import { vesselToFormInitial } from "@/lib/vessel-form";

function value(input: string | number | null | undefined) {
  if (input === null || input === undefined || input === "") return "-";
  return typeof input === "number" ? input.toLocaleString("en") : input;
}

function CompanyCard({
  title,
  company,
  href,
}: {
  title: string;
  company: VesselWithEtas["shipOwnerCompany"];
  href: string;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      {company ? (
        <div className="mt-3 space-y-2 text-sm">
          <Link href={href} className="text-base font-semibold text-slate-950 hover:text-ocean">
            {company.companyName}
          </Link>
          <p className="text-slate-600">{company.country ?? "Country not set"}</p>
          <p className="text-slate-600">{company.email ?? "No email"}</p>
          <p className="text-slate-600">{company.phone ?? "No phone"}</p>
          {company.website ? (
            <a href={company.website} className="font-semibold text-ocean" target="_blank" rel="noreferrer">
              Website
            </a>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No company linked.</p>
      )}
    </article>
  );
}

function etaCountdown(eta: Date) {
  const ms = eta.getTime() - Date.now();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return { label: "Today", tone: "bg-red-100 text-red-700 ring-red-200" };
  if (days === 1) return { label: "Tomorrow", tone: "bg-amber-100 text-amber-700 ring-amber-200" };
  return { label: `In ${days} days`, tone: "bg-emerald-100 text-emerald-700 ring-emerald-200" };
}

function VesselSchemaSection({
  title,
  vessel,
}: {
  title: string;
  vessel: VesselWithEtas;
}) {
  const fields = VESSEL_SCHEMA_FIELDS.filter((field) => field.group === title);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {fields.map((field) => (
          <div key={field.label} className="min-w-0 rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{field.label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950" title={vesselFieldValue(vessel, field)}>
              {field.key === "vesselTypeDetailed" && vesselFieldValue(vessel, field) === "-"
                ? formatEnum(vessel.vesselType)
                : vesselFieldValue(vessel, field)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function VesselDetail({
  vessel,
  associatedContacts,
  isSuperAdmin = false,
}: {
  vessel: VesselWithEtas;
  associatedContacts: MarineVesselContactView[];
  isSuperAdmin?: boolean;
}) {
  const upcomingEtas = vessel.etas;
  const schemaGroups = ["Priority", "Identity", "AIS and Position", "Dimensions and Capacity", "Commercial", "Ownership and Management", "Builders and Class"];

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-3xl font-semibold text-slate-950">{vessel.vesselName}</h2>
              <span className="rounded-md bg-navy px-2 py-1 text-xs font-semibold text-white">IMO {vessel.imoNumber}</span>
              <span className="rounded-md bg-ocean/10 px-2 py-1 text-xs font-semibold text-ocean">{formatEnum(vessel.vesselType)}</span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              MMSI {vessel.mmsi ?? "-"} | Callsign {vessel.callsign ?? "-"} | Flag {vessel.flag ?? "-"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSuperAdmin ? <EditVesselButton initial={vesselToFormInitial(vessel)} /> : null}
            <Link
              href={`/dashboard/vessels/${vessel.imoNumber}/add-eta`}
              className="rounded-md bg-ocean px-3 py-2 text-sm font-semibold text-white hover:bg-ocean/90"
            >
              + Add ETA
            </Link>
            <span className="rounded-md bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{formatEnum(vessel.status)}</span>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {[
            ["DWT", value(vessel.dwt)],
            ["GT", value(vessel.grossTonnage)],
            ["NT", value(vessel.netTonnage)],
            ["LOA", value(vessel.lengthOverall)],
            ["Draught", value(vessel.draught ?? vessel.draft)],
            ["Built", value(vessel.builtYear)],
            ["Class", value(vessel.classSocietyName ?? vessel.classificationSociety)],
          ].map(([label, item]) => (
            <div key={label} className="rounded-md bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 text-sm font-semibold text-slate-950">{item}</p>
            </div>
          ))}
        </div>
      </section>
      {schemaGroups.map((group) => (
        <VesselSchemaSection key={group} title={group} vessel={vessel} />
      ))}
      <section className="grid gap-4 lg:grid-cols-3">
        <CompanyCard
          title="Ship Owner"
          company={vessel.shipOwnerCompany}
          href={vessel.shipOwnerCompany ? `/dashboard/companies/ship-owners/${vessel.shipOwnerCompany.id}` : "#"}
        />
        <CompanyCard
          title="ISM Manager"
          company={vessel.ismManagerCompany}
          href={vessel.ismManagerCompany ? `/dashboard/companies/ism-managers/${vessel.ismManagerCompany.id}` : "#"}
        />
        <CompanyCard
          title="Commercial Manager"
          company={vessel.commercialManagerCompany}
          href={vessel.commercialManagerCompany ? `/dashboard/companies/commercial-managers/${vessel.commercialManagerCompany.id}` : "#"}
        />
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Associated Contacts</h3>
          <span className="text-xs font-semibold text-slate-500">
            {associatedContacts.length.toLocaleString("en")} matched
          </span>
        </div>
        {associatedContacts.length === 0 ? (
          <p className="pt-4 text-sm text-slate-500">No contacts are associated with this vessel yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {["Name", "Email", "Company", "Title", "Matched Value", "Matched Role", "Match Source", "Confidence"].map((label) => (
                    <th key={label} className="whitespace-nowrap px-3 py-2">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {associatedContacts.map((contact) => {
                  const roles = contact.matchedCompanies.map((company) => company.role).join(", ") || "-";
                  return (
                    <tr key={`${contact.contactId}:${contact.matchedValue}:${contact.matchedSource}`} className="hover:bg-slate-50">
                      <td className="max-w-[180px] truncate px-3 py-2 font-semibold text-slate-950" title={contact.fullName}>
                        <Link href={`/dashboard/contacts/${contact.contactId}`} className="hover:text-ocean">{contact.fullName}</Link>
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-slate-600" title={contact.email ?? undefined}>{contact.email ?? "-"}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-slate-600" title={contact.companyName ?? undefined}>{contact.companyName ?? "-"}</td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-slate-600" title={contact.jobTitle ?? undefined}>{contact.jobTitle ?? "-"}</td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-slate-600" title={contact.matchedValue}>{contact.matchedValue}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-slate-600" title={roles}>{roles}</td>
                      <td className="max-w-[180px] truncate px-3 py-2 text-slate-600" title={contact.matchedSource}>{contact.matchedSource}</td>
                      <td className="px-3 py-2 text-slate-600">{contact.confidence}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Upcoming ETAs</h3>
          <div className="flex items-center gap-3 text-xs font-medium">
            <Link href={`/dashboard/vessels/${vessel.imoNumber}/crm`} className="text-ocean hover:underline">CRM history →</Link>
            <Link href="/dashboard/port-radar" className="text-ocean hover:underline">Port Radar →</Link>
          </div>
        </div>
        {upcomingEtas.length === 0 ? (
          <p className="pt-4 text-sm text-slate-500">No upcoming ETA records. Use <Link href={`/dashboard/vessels/${vessel.imoNumber}/add-eta`} className="font-semibold text-ocean">+ Add ETA</Link> to enter a future destination, ETA timestamp, and previous/next cargo.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {upcomingEtas.map((eta) => {
              const countdown = etaCountdown(eta.eta);
              return (
                <li key={eta.id} className="rounded-md border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {eta.destinationPortName} ({eta.destinationPort})
                      </p>
                      <p className="text-xs text-slate-500">{eta.eta.toISOString().slice(0, 16).replace("T", " ")}Z · {formatEnum(eta.etaConfidence)} · {formatEnum(eta.voyageStatus)}</p>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${countdown.tone}`}>{countdown.label}</span>
                  </div>
                  {(eta.previousCargo || eta.nextCargo) ? (
                    <p className="mt-1 text-xs text-slate-500">Cargo: {eta.previousCargo ?? "—"} → {eta.nextCargo ?? "—"}</p>
                  ) : null}
                  {eta.triggers.length > 0 ? (
                    <p className="mt-1 text-xs text-emerald-700">{eta.triggers.length} campaign(s) triggered: {eta.triggers.map((t) => t.campaign.name).join(", ")}</p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">No campaigns triggered</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

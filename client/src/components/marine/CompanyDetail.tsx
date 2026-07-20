import Link from "next/link";
import type { VesselWithCompanies } from "@/lib/marine-data";
import { formatEnum } from "@/lib/marine-data";
import { VESSEL_SCHEMA_FIELDS, vesselFieldValue } from "@/lib/vessel-schema";

type CompanyDetailModel = {
  id: string;
  companyName: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  linkedinUrl: string | null;
  orgType: string;
  fleetSize: number;
  verified: boolean;
  notes: string | null;
};

export function CompanyDetail({
  company,
  vessels,
}: {
  company: CompanyDetailModel;
  vessels: VesselWithCompanies[];
}) {
  const linkedVesselFields = VESSEL_SCHEMA_FIELDS.filter((field) =>
    ["Vessel Name", "Imo", "Flag", "Vessel Type - Detailed", "Capacity - Dwt", "Current Port Unlocode", "Commercial Manager", "Ism Manager", "Operator"].includes(field.label),
  );

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-3xl font-semibold text-slate-950">{company.companyName}</h2>
              <span className="rounded-md bg-ocean/10 px-2 py-1 text-xs font-semibold text-ocean">{formatEnum(company.orgType)}</span>
              {company.verified ? <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Verified</span> : null}
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {[company.city, company.country].filter(Boolean).join(", ") || "Location not set"}
            </p>
          </div>
          <span className="rounded-md bg-navy px-3 py-2 text-sm font-semibold text-white">{company.fleetSize} fleet size</span>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{company.phone ?? "-"}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p>
            <p className="mt-1 break-all text-sm font-semibold text-slate-950">{company.email ?? "-"}</p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Website</p>
            {company.website ? (
              <a href={company.website} target="_blank" rel="noreferrer" className="mt-1 block text-sm font-semibold text-ocean">
                Open
              </a>
            ) : (
              <p className="mt-1 text-sm font-semibold text-slate-950">-</p>
            )}
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">LinkedIn</p>
            {company.linkedinUrl ? (
              <a href={company.linkedinUrl} target="_blank" rel="noreferrer" className="mt-1 block text-sm font-semibold text-ocean">
                Open
              </a>
            ) : (
              <p className="mt-1 text-sm font-semibold text-slate-950">-</p>
            )}
          </div>
        </div>
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3 text-sm font-semibold text-slate-600">
          {["Overview", "Vessels", "Contacts", "Notes"].map((tab) => (
            <button key={tab} className={tab === "Vessels" ? "rounded-md bg-navy px-3 py-2 text-white" : "rounded-md px-3 py-2 hover:bg-slate-100"}>
              {tab}
            </button>
          ))}
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[1200px] divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                {linkedVesselFields.map((field) => (
                  <th key={field.label} className="whitespace-nowrap px-4 py-3">{field.label}</th>
                ))}
                <th className="px-4 py-3">Current ETA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vessels.map((vessel) => (
                <tr key={vessel.id}>
                  {linkedVesselFields.map((field) => (
                    <td key={field.label} className="max-w-[220px] truncate px-4 py-3 text-slate-600" title={vesselFieldValue(vessel, field)}>
                      {field.key === "vesselName" ? (
                        <Link href={`/dashboard/vessels/${vessel.imoNumber}`} className="font-semibold text-slate-950 hover:text-ocean">
                          {vesselFieldValue(vessel, field)}
                        </Link>
                      ) : field.key === "vesselTypeDetailed" && vesselFieldValue(vessel, field) === "-" ? (
                        formatEnum(vessel.vesselType)
                      ) : (
                        vesselFieldValue(vessel, field)
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">No ETA</span>
                  </td>
                </tr>
              ))}
              {vessels.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-500" colSpan={linkedVesselFields.length + 1}>
                    No vessels linked to this company yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

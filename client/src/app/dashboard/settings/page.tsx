import Link from "next/link";
import { Anchor, CreditCard, Radar, Timer, Workflow } from "lucide-react";

const settingsLinks = [
  {
    href: "/dashboard/settings/sending",
    title: "Sending Defaults",
    description: "Set the default random gap between outgoing emails for every new campaign (5–20 min).",
    icon: Timer,
  },
  {
    href: "/dashboard/settings/port-rules",
    title: "Port Campaign Rules",
    description: "Auto-assign a campaign when a vessel of a given type arrives at a specific port.",
    icon: Radar,
  },
  {
    href: "/dashboard/settings/cargo-rules",
    title: "Cargo Change Rules",
    description: "Fire a campaign when a vessel's previous cargo and next cargo combination matches.",
    icon: Workflow,
  },
  {
    href: "/dashboard/settings/billing",
    title: "Billing & Credits",
    description: "Manage your plan, top up DB credits, open the Stripe customer portal.",
    icon: CreditCard,
  },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-shell">
        <p className="text-xs font-semibold uppercase tracking-wide text-ocean">Workspace Settings</p>
        <h2 className="mt-1 text-2xl font-semibold text-slate-950">Configure ETA automation</h2>
        <p className="mt-2 text-sm text-slate-600">
          Port and cargo rules drive which campaigns are auto-suggested when a new VesselETA is created.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        {settingsLinks.map((link) => {
          const Icon = link.icon;
          return (
            <Link key={link.href} href={link.href} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-ocean">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-ocean/10 p-2 text-ocean">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-slate-950">{link.title}</h3>
              </div>
              <p className="mt-2 text-sm text-slate-600">{link.description}</p>
            </Link>
          );
        })}
      </section>
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Coming soon</h3>
        <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
          <Anchor className="h-4 w-4 text-slate-400" /> Team management — invite members and assign roles to your workspace.
        </p>
      </section>
    </div>
  );
}

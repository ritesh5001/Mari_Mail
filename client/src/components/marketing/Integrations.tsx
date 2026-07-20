import {
  Anchor,
  AtSign,
  Database,
  Globe2,
  Mail,
  RadioTower,
  Ship,
  Workflow,
} from "lucide-react";

const integrations = [
  { label: "Gmail", icon: Mail },
  { label: "Outlook", icon: AtSign },
  { label: "IMAP / SMTP", icon: Globe2 },
  { label: "IMO", icon: Anchor },
  { label: "AIS", icon: RadioTower },
  { label: "MarineTraffic", icon: Ship },
  { label: "BullMQ", icon: Workflow },
  { label: "Postgres", icon: Database },
];

export function Integrations() {
  return (
    <section className="relative bg-black py-16">
      <div className="mx-auto w-full max-w-6xl px-6 text-center">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-white/40">
          Works with the stack you already use
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {integrations.map((integration, index) => (
            <div
              key={integration.label}
              className={`inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm font-semibold text-white/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 hover:-translate-y-1 hover:border-accent-500/35 hover:bg-white/[0.055] hover:text-white/85 animate-float-y-${(index % 3) + 1}`}
            >
              <integration.icon className="h-4 w-4" />
              {integration.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

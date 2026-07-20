import { Radar, Users, Send, BarChart3 } from "lucide-react";

type MockRow = [name: string, sub: string, status: string];

const features: {
  icon: typeof Radar;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  rows: MockRow[];
}[] = [
  {
    icon: Radar,
    eyebrow: "Layer 01",
    title: "High Quality Verified Vessels",
    body: "Just tell our AI exactly which vessels you're targeting — in your own words. It scans 120K+ IMO records and returns high-quality leads that boost your campaign success.",
    cta: "Start for FREE",
    rows: [
      ["MV Northern Star", "IMO 9412883 · Bulk", "Verified"],
      ["Fleetline Bulk Carrier", "IMO 9588471 · Bulk", "Matched"],
      ["MV Aegean Pearl", "IMO 9731204 · Tanker", "Verified"],
      ["Tanker · OceanWave 7", "IMO 9650118 · Crude", "Enriched"],
    ],
  },
  {
    icon: Users,
    eyebrow: "Layer 02",
    title: "Connect Email Accounts From Any Provider",
    body: "Whether you're using Gmail, Outlook, or any IMAP/SMTP inbox, MariMail seamlessly supports them all — with warmup, rotation, and DNS health built in.",
    cta: "Start for FREE",
    rows: [
      ["ops@nordicship.com", "Gmail · Warmup 92%", "Healthy"],
      ["chartering@bluewave.io", "Outlook · Rotation on", "Healthy"],
      ["sales@fjordtank.no", "IMAP/SMTP · DNS ok", "Connected"],
      ["desk@aegeanlines.gr", "Gmail · Warmup 74%", "Warming"],
    ],
  },
  {
    icon: Send,
    eyebrow: "Layer 03",
    title: "ETA-Triggered Sequences",
    body: "BullMQ schedules every step at the right ETA offset, rotates across your inboxes, renders personalisation, and sends through your own servers. No third-party SaaS in the loop.",
    cta: "Start for FREE",
    rows: [
      ["MV Coral Horizon", "Step 2 · ETA −48h", "Sequenced"],
      ["Stellar Trader", "Step 1 · ETA −72h", "Scheduled"],
      ["MV Baltic Dawn", "Step 3 · ETA −24h", "Sending"],
      ["Gulf Mariner 9", "Step 2 · ETA −36h", "Sequenced"],
    ],
  },
  {
    icon: BarChart3,
    eyebrow: "Layer 04",
    title: "Track every reply, bounce and opportunity",
    body: "Opens, clicks, bounces, and replies stream into the workspace timeline. Auto-pause on reply. Auto-suppress on unsubscribe. Full marine CRM context per contact.",
    cta: "Start for FREE",
    rows: [
      ["MV Pacific Crest", "Replied · 2m ago", "Replied"],
      ["Orient Carrier", "Opened · 3×", "Opened"],
      ["MV Sienna Bay", "Bounced · hard", "Bounced"],
      ["Harbor Spirit 4", "Unsubscribed", "Suppressed"],
    ],
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative scroll-mt-24 bg-black py-24 lg:py-32">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="space-y-6">
          {features.map((f, i) => (
            <article
              key={f.title}
              className={`premium-card grid grid-cols-1 items-center gap-10 overflow-hidden rounded-3xl border border-white/8 bg-gradient-to-br from-white/[0.055] via-[#0F0F11] to-accent-600/[0.035] p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-500 hover:-translate-y-1 hover:border-accent-500/25 hover:shadow-[0_26px_90px_rgba(0,0,0,0.38)] md:grid-cols-2 lg:p-12 ${
                i % 2 === 1 ? "md:[&>div:first-child]:order-2" : ""
              }`}
            >
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-accent-300">
                  <f.icon className="h-3.5 w-3.5" />
                  {f.eyebrow}
                </span>
                <h3 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-white md:text-4xl">
                  {f.title.split(" ").map((word, idx, arr) => {
                    const accentIdx = Math.floor(arr.length / 2);
                    if (idx === accentIdx) {
                      return (
                        <span key={idx}>
                          <span className="violet-accent">{word}</span>{" "}
                        </span>
                      );
                    }
                    return <span key={idx}>{word} </span>;
                  })}
                </h3>
                <p className="mt-4 max-w-md text-pretty text-sm leading-6 text-white/60 md:text-base">
                  {f.body}
                </p>
                <a
                  href="/book-demo"
                  className="mt-6 inline-block border-b border-white/40 pb-0.5 text-sm font-semibold text-white transition-colors hover:border-white"
                >
                  {f.cta}
                </a>
              </div>

              <div className="relative">
                <div className="absolute -inset-4 -z-10 rounded-3xl bg-accent-600/10 blur-3xl" aria-hidden />
                <div className="animate-float-y-deep rounded-2xl border border-white/10 bg-black/60 p-4 shadow-shell">
                  <div className="flex items-center gap-1.5 border-b border-white/5 pb-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500 ring-1 ring-black/20 shadow-sm" aria-hidden />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400 ring-1 ring-black/15 shadow-sm" aria-hidden />
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500 ring-1 ring-black/20 shadow-sm" aria-hidden />
                  </div>
                  <div className="mt-4 space-y-2">
                    {f.rows.map(([name, sub, status]) => (
                      <div
                        key={name}
                        className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm transition-colors hover:border-accent-500/20 hover:bg-white/[0.045]"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-white">{name}</p>
                          <p className="truncate text-[11px] text-white/40">{sub}</p>
                        </div>
                        <span className="ml-3 shrink-0 rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-300">
                          {status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

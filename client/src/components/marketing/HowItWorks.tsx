import {
  Radar,
  Users,
  Send,
  BarChart3,
  Check,
  Mail,
  Reply,
  MousePointerClick,
  AlertTriangle,
  Ban,
  Plus,
} from "lucide-react";

// Each layer gets a mock that matches the ACTUAL product screen it describes,
// rather than one generic row-list reused four times. The `mock` field is a
// tagged union selecting which renderer to show on the right side of the card.
type VesselRow = { name: string; sub: string; status: string };
type InboxRow = { email: string; provider: "Gmail" | "Outlook" | "IMAP/SMTP"; meta: string; warmup?: number; state: string };
type SequenceStep = { label: string; offset: string; subject: string; state: string };
type TimelineEvent = { kind: "reply" | "open" | "click" | "bounce" | "unsub"; who: string; detail: string; time: string };

type Mock =
  | { type: "list"; rows: VesselRow[] }
  | { type: "inboxes"; rows: InboxRow[] }
  | { type: "sequence"; steps: SequenceStep[] }
  | { type: "timeline"; events: TimelineEvent[] };

type Feature = {
  icon: typeof Radar;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
  mock: Mock;
};

const features: Feature[] = [
  {
    icon: Radar,
    eyebrow: "Layer 01",
    title: "High Quality Verified Vessels",
    body: "Just tell our AI exactly which vessels you're targeting — in your own words. It scans 120K+ IMO records and returns high-quality leads that boost your campaign success.",
    cta: "Start for FREE",
    mock: {
      type: "list",
      rows: [
        { name: "MV Northern Star", sub: "IMO 9412883 · Bulk", status: "Verified" },
        { name: "Fleetline Bulk Carrier", sub: "IMO 9588471 · Bulk", status: "Matched" },
        { name: "MV Aegean Pearl", sub: "IMO 9731204 · Tanker", status: "Verified" },
        { name: "OceanWave 7", sub: "IMO 9650118 · Crude", status: "Enriched" },
      ],
    },
  },
  {
    icon: Users,
    eyebrow: "Layer 02",
    title: "Connect Email Accounts From Any Provider",
    body: "Whether you're using Gmail, Outlook, or any IMAP/SMTP inbox, MariMail seamlessly supports them all — with warmup, rotation, and DNS health built in.",
    cta: "Start for FREE",
    mock: {
      type: "inboxes",
      rows: [
        { email: "ops@nordicship.com", provider: "Gmail", meta: "OAuth · DNS ok", warmup: 92, state: "Healthy" },
        { email: "chartering@bluewave.io", provider: "Outlook", meta: "OAuth · Rotation on", warmup: 88, state: "Healthy" },
        { email: "sales@fjordtank.no", provider: "IMAP/SMTP", meta: "SPF · DKIM · DMARC", state: "Connected" },
        { email: "desk@aegeanlines.gr", provider: "Gmail", meta: "OAuth · Warming", warmup: 74, state: "Warming" },
      ],
    },
  },
  {
    icon: Send,
    eyebrow: "Layer 03",
    title: "ETA-Triggered Sequences",
    body: "Build each step visually and pin it to the ETA. MariMail schedules every send at the right offset, rotates across your inboxes, renders personalisation, and sends through your own servers.",
    cta: "Start for FREE",
    mock: {
      type: "sequence",
      steps: [
        { label: "Step 1", offset: "3 days before ETA", subject: "{{vessel}} arriving {{port}} — hull cleaning?", state: "Sent" },
        { label: "Step 2", offset: "1 day before ETA", subject: "Shore gang availability for {{vessel}}", state: "Scheduled" },
        { label: "Step 3", offset: "On arrival", subject: "We're ready at berth — quick quote", state: "Queued" },
      ],
    },
  },
  {
    icon: BarChart3,
    eyebrow: "Layer 04",
    title: "Track every reply, bounce and opportunity",
    body: "Opens, clicks, bounces, and replies stream into the workspace timeline. Auto-pause on reply. Auto-suppress on unsubscribe. Full marine CRM context per contact.",
    cta: "Start for FREE",
    mock: {
      type: "timeline",
      events: [
        { kind: "reply", who: "Capt. Nilsen · Nordic Ship", detail: "Replied — sequence auto-paused", time: "2m ago" },
        { kind: "open", who: "Chartering · Blue Wave", detail: "Opened · 3 times", time: "18m ago" },
        { kind: "click", who: "Ops · Fjord Tank", detail: "Clicked quote link", time: "1h ago" },
        { kind: "bounce", who: "desk@oldline.gr", detail: "Hard bounce — suppressed", time: "3h ago" },
        { kind: "unsub", who: "Sales · Aegean Lines", detail: "Unsubscribed — suppressed", time: "5h ago" },
      ],
    },
  },
];

// --- Per-type mock renderers (all wrapped by the shared browser-chrome frame) ---

function VesselList({ rows }: { rows: VesselRow[] }) {
  return (
    <div className="mt-4 space-y-2">
      {rows.map((r) => (
        <div
          key={r.name}
          className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm transition-colors hover:border-accent-500/20 hover:bg-white/[0.045]"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-white">{r.name}</p>
            <p className="truncate text-[11px] text-white/40">{r.sub}</p>
          </div>
          <span className="ml-3 shrink-0 rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-300">
            {r.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function InboxProviders({ rows }: { rows: InboxRow[] }) {
  const badge: Record<InboxRow["provider"], string> = {
    Gmail: "bg-red-500/15 text-red-300",
    Outlook: "bg-accent-500/15 text-accent-300",
    "IMAP/SMTP": "bg-white/10 text-white/70",
  };
  return (
    <div className="mt-4 space-y-2">
      {rows.map((r) => (
        <div
          key={r.email}
          className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 text-sm transition-colors hover:border-accent-500/20 hover:bg-white/[0.045]"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-500/10 text-accent-300">
            <Mail className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-white">{r.email}</p>
            <p className="truncate text-[11px] text-white/40">{r.meta}</p>
            {typeof r.warmup === "number" ? (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span
                    className="block h-full rounded-full bg-gradient-to-r from-accent-500 to-accent-400"
                    style={{ width: `${r.warmup}%` }}
                  />
                </span>
                <span className="text-[10px] tabular-nums text-white/45">{r.warmup}%</span>
              </div>
            ) : null}
          </div>
          <div className="ml-1 flex shrink-0 flex-col items-end gap-1">
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${badge[r.provider]}`}>
              {r.provider}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-300">
              <Check className="h-3 w-3" strokeWidth={3} />
              {r.state}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SequenceBuilder({ steps }: { steps: SequenceStep[] }) {
  return (
    <div className="mt-4 space-y-0">
      {steps.map((s, i) => (
        <div key={s.label} className="relative pl-8">
          {/* rail */}
          <span className="absolute left-[11px] top-1 grid h-5 w-5 place-items-center rounded-full bg-accent-500 text-[10px] font-bold text-white ring-4 ring-black/60">
            {i + 1}
          </span>
          {i < steps.length - 1 && (
            <span className="absolute left-[20px] top-6 h-[calc(100%-8px)] w-px bg-gradient-to-b from-accent-500/60 to-accent-500/10" aria-hidden />
          )}
          <div className="mb-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-colors hover:border-accent-500/20 hover:bg-white/[0.045]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-300">
                {s.label} · {s.offset}
              </span>
              <span className="shrink-0 rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-semibold text-accent-300">
                {s.state}
              </span>
            </div>
            <p className="mt-1 truncate text-sm font-medium text-white">{s.subject}</p>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/15 py-2 text-[11px] font-medium text-white/45"
        tabIndex={-1}
        aria-hidden
      >
        <Plus className="h-3.5 w-3.5" /> Add step
      </button>
    </div>
  );
}

function ActivityTimeline({ events }: { events: TimelineEvent[] }) {
  const meta: Record<TimelineEvent["kind"], { icon: typeof Reply; tint: string; label: string }> = {
    reply: { icon: Reply, tint: "text-emerald-300 bg-emerald-500/15", label: "Replied" },
    open: { icon: Mail, tint: "text-accent-300 bg-accent-500/15", label: "Opened" },
    click: { icon: MousePointerClick, tint: "text-accent-300 bg-accent-500/15", label: "Clicked" },
    bounce: { icon: AlertTriangle, tint: "text-amber-300 bg-amber-500/15", label: "Bounced" },
    unsub: { icon: Ban, tint: "text-rose-300 bg-rose-500/15", label: "Unsub" },
  };
  return (
    <div className="mt-4 space-y-1">
      {events.map((e, i) => {
        const m = meta[e.kind];
        const Icon = m.icon;
        return (
          <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.03]">
            <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full ${m.tint}`}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-white">{e.who}</p>
                <span className="shrink-0 text-[10px] text-white/35">{e.time}</span>
              </div>
              <p className="truncate text-[11px] text-white/45">{e.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MockScreen({ mock }: { mock: Mock }) {
  switch (mock.type) {
    case "list":
      return <VesselList rows={mock.rows} />;
    case "inboxes":
      return <InboxProviders rows={mock.rows} />;
    case "sequence":
      return <SequenceBuilder steps={mock.steps} />;
    case "timeline":
      return <ActivityTimeline events={mock.events} />;
  }
}

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
                  <MockScreen mock={f.mock} />
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

import Link from "next/link";
import { Check, Gift, Sparkles } from "lucide-react";

// Early-access promo: every paid plan is free for our first users.
const EARLY_ACCESS_SEATS = 100;

type Tier = {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  cta: string;
  href: string;
  highlight?: boolean;
  freeEarlyAccess?: boolean;
};

const tiers: Tier[] = [
  {
    name: "Starter",
    price: "$49",
    period: "/ month",
    description: "For solo operators dipping into ETA-driven outreach.",
    features: [
      "1 connected inbox",
      "5,000 contacts",
      "Vessel DBMS read access",
      "Manual ETA triggers",
      "Email + reply tracking",
    ],
    cta: "Claim free access",
    href: "/book-demo",
    freeEarlyAccess: true,
  },
  {
    name: "Pro",
    price: "$149",
    period: "/ month",
    description: "The full ETA engine, multi-inbox rotation, port radar.",
    features: [
      "5 connected inboxes",
      "50,000 contacts",
      "Full ETA & cargo trigger engine",
      "Port Radar + saved smart lists",
      "Warmup, DNS health, A/B testing",
      "Priority support",
    ],
    cta: "Claim free access",
    href: "/book-demo",
    highlight: true,
    freeEarlyAccess: true,
  },
  {
    name: "Fleet",
    price: "Custom",
    description: "For brokerages and shipping desks running enterprise scale.",
    features: [
      "Unlimited inboxes & contacts",
      "SSO + role-based access",
      "Dedicated tenant + SLA",
      "Custom data feeds & integrations",
      "Onboarding engineer",
    ],
    cta: "Talk to sales",
    href: "mailto:info@maribiz.ai",
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="relative scroll-mt-24 bg-black py-24 lg:py-32">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent-500/30 bg-accent-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">
            <Gift className="h-3.5 w-3.5" />
            Free for our first {EARLY_ACCESS_SEATS} users
          </span>
          <h2 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-white md:text-5xl lg:text-[3.5rem]">
            Simple pricing.{" "}
            <span className="violet-accent">Marine-grade</span> value.
          </h2>
          <p className="mt-5 text-pretty text-base leading-7 text-white/60 md:text-lg">
            We&apos;re onboarding early. Every plan below is{" "}
            <span className="font-semibold text-white">100% free</span> for the
            first {EARLY_ACCESS_SEATS} sign-ups — no credit card, no commitment.
            Lock in your seat before they&apos;re gone.
          </p>
        </div>

        <div className="mt-16 grid grid-cols-1 items-stretch gap-5 lg:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`premium-card relative flex flex-col rounded-2xl p-8 transition-all duration-500 hover:-translate-y-2 ${
                t.highlight
                  ? "border border-accent-500/40 bg-gradient-to-b from-[#160F24] to-[#0F0F11] shadow-glow lg:-translate-y-3"
                  : "border border-white/8 bg-gradient-to-b from-white/[0.045] to-[#0F0F11] hover:border-accent-500/25 hover:shadow-[0_24px_80px_rgba(7, 89, 133,0.13)]"
              }`}
            >
              {t.highlight && (
                <span className="absolute -top-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent-500 px-3 py-1 text-xs font-semibold text-white shadow-shell ring-2 ring-black">
                  <Sparkles className="h-3 w-3" />
                  Most popular
                </span>
              )}

              <h3
                className={`text-xs font-semibold uppercase tracking-[0.2em] ${
                  t.highlight ? "text-accent-300" : "text-white/50"
                }`}
              >
                {t.name}
              </h3>
              {t.freeEarlyAccess ? (
                <div className="mt-4">
                  <div className="flex items-baseline gap-2">
                    <span className="font-serif text-6xl font-normal tracking-tight text-white">
                      Free
                    </span>
                    <span className="font-serif text-2xl font-normal tracking-tight text-white/35 line-through">
                      {t.price}
                    </span>
                    {t.period && (
                      <span className="text-sm font-medium text-white/35 line-through">
                        {t.period}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-accent-300">
                    <Gift className="h-3.5 w-3.5" />
                    Free for the first {EARLY_ACCESS_SEATS} users
                  </p>
                </div>
              ) : (
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="font-serif text-6xl font-normal tracking-tight text-white">
                    {t.price}
                  </span>
                  {t.period && (
                    <span className="text-sm font-medium text-white/50">
                      {t.period}
                    </span>
                  )}
                </div>
              )}
              <p className="mt-3 text-sm leading-6 text-white/60">
                {t.description}
              </p>

              <Link
                href={t.href}
                className={`mt-6 inline-flex h-11 items-center justify-center rounded-lg text-sm font-semibold transition-all hover:-translate-y-0.5 ${
                  t.highlight
                    ? "bg-[#F8FAFC] text-black hover:bg-[#EDEDF0]"
                    : "border border-white/15 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                }`}
              >
                {t.cta}
              </Link>

              <ul className="mt-8 space-y-3 border-t border-white/8 pt-6">
                {t.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-3 text-sm text-white/70"
                  >
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-accent-300">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-white/40">
          All plans include self-hosted sending through your own Gmail / Outlook
          / SMTP inboxes. No per-email markup.
        </p>
      </div>
    </section>
  );
}

import Link from "next/link";
import { Calendar, ShieldCheck } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { BookDemoForm } from "@/components/marketing/BookDemoForm";
import { apiUrl } from "@/lib/api";

type PublicSettings = {
  enabled: boolean;
  successMessage: string;
};

async function getPublicSettings(): Promise<PublicSettings> {
  try {
    const response = await fetch(`${apiUrl}/api/demo/public-settings`, { cache: "no-store" });
    if (!response.ok) {
      return { enabled: true, successMessage: "Thanks! We'll be in touch within one business day." };
    }
    const payload = (await response.json()) as { data: PublicSettings };
    return payload.data;
  } catch {
    return { enabled: true, successMessage: "Thanks! We'll be in touch within one business day." };
  }
}

export const metadata = {
  title: "Book a Demo · MariMail",
  description: "See how MariMail surfaces vessel ETAs, contacts and outreach in one place. Book a 25-minute walkthrough.",
};

export default async function BookDemoPage() {
  const settings = await getPublicSettings();

  return (
    <main
      data-marketing-root
      className="marketing-root relative min-h-screen overflow-x-clip bg-black text-white"
    >
      <MarketingNav />

      <section className="relative isolate overflow-hidden">
        <div className="absolute inset-0 -z-10 starfield animate-star-pulse opacity-60" aria-hidden />
        <div className="absolute inset-0 -z-10 hero-aurora animate-aurora-drift opacity-70" aria-hidden />

        <div className="mx-auto grid w-full max-w-6xl gap-12 px-6 pb-24 pt-36 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-44">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-white/70">
              <Calendar className="h-3.5 w-3.5" />
              25-minute walkthrough
            </div>

            <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]">
              See how <span className="violet-accent">MariMail</span> wins you more vessels
            </h1>

            <p className="mt-5 max-w-xl text-base leading-7 text-white/65 md:text-lg">
              In 25 minutes, we&rsquo;ll show you how teams use MariMail to spot inbound ships,
              reach the right decision-makers, and turn ETAs into booked revenue.
            </p>

            <ul className="mt-8 space-y-3 text-sm text-white/75">
              {[
                "Know which vessels need your services before they arrive at port",
                "Reach captains, superintendents and procurement at the right time",
                "Automate outreach that lands in the inbox — without sounding like spam",
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-white/60">
              <ShieldCheck className="h-4 w-4 flex-shrink-0 text-emerald-300" />
              <span>
                We won&rsquo;t share your details. Prefer email?{" "}
                <Link href="mailto:info@maribiz.ai" className="text-accent-300 hover:text-accent-200">
                  info@maribiz.ai
                </Link>
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-accent-500/40 via-sky-500/20 to-transparent opacity-50 blur-2xl" aria-hidden />
            <div className="relative rounded-2xl border border-sky-100 bg-white p-6 shadow-[0_24px_80px_rgba(79,70,229,0.16)] backdrop-blur dark:border-white/10 dark:bg-[#0a0a0c]/90 dark:shadow-[0_20px_80px_rgba(0,0,0,0.5)]">
              {settings.enabled ? (
                <BookDemoForm successMessage={settings.successMessage} />
              ) : (
                <div className="py-10 text-center">
                  <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Demo bookings paused</h2>
                  <p className="mt-2 text-sm text-slate-600 dark:text-white/60">
                    We&rsquo;re temporarily not accepting new demo requests. Please email{" "}
                    <Link href="mailto:info@maribiz.ai" className="text-sky-700 hover:text-sky-600 dark:text-accent-300 dark:hover:text-accent-200">
                      info@maribiz.ai
                    </Link>{" "}
                    and we&rsquo;ll get back to you.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}

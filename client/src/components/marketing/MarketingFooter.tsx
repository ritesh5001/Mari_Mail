import Link from "next/link";
import { WhatsAppLink } from "./WhatsAppButton";

const columns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Features", href: "/#product" },
      { label: "How it works", href: "/#how-it-works" },
      { label: "Pricing", href: "/#pricing" },
      { label: "FAQs", href: "/#faqs" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Book a demo", href: "/book-demo" },
      { label: "Sign in", href: "/login" },
      { label: "Create account", href: "/register" },
      { label: "Contact", href: "mailto:info@maribiz.ai" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Security", href: "/security" },
      { label: "DPA", href: "/dpa" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-white/10 bg-black">
      <div className="mx-auto w-full max-w-7xl px-6 py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            {/* Footer is bg-black, so the full lockup reads correctly here and
                the wordmark is part of the image — the text span next to it was
                printing "MariMail" twice. Sized taller because the lockup now
                carries the tagline as well. */}
            <Link href="/" className="inline-flex items-center">
              <img src="/logo.png" alt="MariMail" className="h-20 w-auto object-contain" />
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-400">
              Marine intelligence + ETA-triggered campaigns. Self-hosted, vessel-aware, built for the
              way ships actually move.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <a
                href="mailto:info@maribiz.ai"
                className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-ocean hover:text-ocean dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
              >
                info@maribiz.ai
              </a>
              {/* Same link and same opening message as the floating button —
                  both come from lib/whatsapp so they cannot drift apart. */}
              <WhatsAppLink className="inline-flex items-center gap-2 rounded-full border border-[#25D366]/40 bg-white px-4 py-2 text-xs font-semibold text-[#1ebe5b] transition-colors hover:border-[#25D366] dark:border-[#25D366]/30 dark:bg-white/5" />
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-slate-600 transition-colors hover:text-navy dark:text-slate-300 dark:hover:text-white"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-slate-100 pt-6 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
          <p>© {new Date().getFullYear()} MariMail. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

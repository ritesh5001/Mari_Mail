import Link from "next/link";

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
            <Link href="/" className="inline-flex items-center gap-2.5">
              <img src="/logo.png" alt="MariMail" className="h-9 w-auto object-contain" />
              <span className="text-[17px] font-semibold tracking-tight text-slate-950 dark:text-white">
                MariMail
              </span>
            </Link>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-600 dark:text-slate-400">
              Marine intelligence + ETA-triggered campaigns. Self-hosted, vessel-aware, built for the
              way ships actually move.
            </p>
            <a
              href="mailto:info@maribiz.ai"
              className="mt-5 inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-ocean hover:text-ocean dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
            >
              info@maribiz.ai
            </a>
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

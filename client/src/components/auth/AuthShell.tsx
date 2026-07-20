import Link from "next/link";
import { Anchor, BarChart3, Mail, Radar, Ship } from "lucide-react";

const features = [
  { icon: Ship, text: "Live vessel DBMS with IMO, flag & DWT tracking" },
  { icon: Radar, text: "ETA port radar — catch arrivals before competitors" },
  { icon: Mail, text: "AI-personalized cold outreach at scale" },
  { icon: BarChart3, text: "Full campaign analytics & reply intelligence" },
];

const stats = [
  { value: "500M+", label: "Emails sent" },
  { value: "5M+", label: "Vessels tracked" },
  { value: "$2.0B+", label: "Pipeline built" },
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="auth-shell min-h-screen bg-slate-50 text-slate-950 dark:bg-[#050507] dark:text-white">
      <div className="grid min-h-screen lg:grid-cols-[1fr_480px] xl:grid-cols-[1fr_520px]">

        {/* ── Left branding panel ── */}
        <section className="relative hidden flex-col overflow-hidden bg-white lg:flex dark:bg-black">
          <div className="absolute inset-0 starfield animate-star-pulse opacity-50" aria-hidden />
          <div className="absolute inset-0 hero-aurora animate-aurora-drift" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-br from-white/80 via-transparent to-sky-100/80 dark:from-[#0A0A0C]/80 dark:to-[#2A38B8]/20" aria-hidden />

          <div className="relative z-10 flex h-full flex-col justify-between p-12">
            <Link href="/" className="flex items-center gap-3" aria-label="MariMail home">
              <img src="/logo.png" alt="MariMail" className="h-9 w-auto object-contain" />
            </Link>

            <div className="space-y-8">
              <div>
                <h2 className="text-4xl font-semibold leading-[1.1] tracking-tight text-slate-950 dark:text-white">
                  Turn vessel movements
                  <br />
                  into{" "}
                  <span className="violet-accent text-[1.05em]">marine outreach</span>
                  <br />
                  that actually lands.
                </h2>
                <p className="mt-4 max-w-md text-[15px] leading-7 text-slate-600 dark:text-white/60">
                  The only platform built for ship-owners, ISM managers and port operators — with live ETA intelligence baked in.
                </p>
              </div>

              <ul className="space-y-3">
                {features.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-accent-500/15">
                      <Icon className="h-3.5 w-3.5 text-accent-400" />
                    </span>
                    <span className="text-sm leading-6 text-slate-700 dark:text-white/75">{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-slate-200 pt-8 dark:border-white/[0.08]">
              {stats.map(({ value, label }) => (
                <div key={label}>
                  <p className="text-xl font-bold text-slate-950 dark:text-white">{value}</p>
                  <p className="text-xs text-slate-500 dark:text-white/50">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Right form panel ── */}
        <section className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 py-12 dark:bg-[#050507]">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden" aria-label="MariMail home">
              <img src="/logo.png" alt="MariMail" className="h-8 w-auto object-contain" />
            </Link>

            <div
              className="w-full rounded-2xl border border-slate-200 bg-white px-8 py-9 shadow-[0_24px_70px_rgba(15,23,42,0.10)] dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
              style={{ backdropFilter: "blur(20px)" }}
            >
              <div className="mb-7">
                <div className="mb-1 flex items-center gap-2">
                  <Anchor className="h-4 w-4 text-accent-400" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-accent-400">MariMail</p>
                </div>
                <h1 className="text-2xl font-semibold text-slate-950 dark:text-white">{title}</h1>
                <p className="mt-1.5 text-sm leading-6 text-slate-600 dark:text-white/55">{subtitle}</p>
              </div>

              {children}

              <div className="mt-6 text-sm text-slate-500 dark:text-white/50">{footer}</div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

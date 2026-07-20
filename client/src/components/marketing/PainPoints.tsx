import Link from "next/link";
import { Calendar } from "lucide-react";

const painPoints = [
  {
    text: "I can't spot which vessels actually need our service.",
    desktopClass: "left-[4%] top-[8%] max-w-[230px] animate-float-y-1",
  },
  {
    text: "Personalizing each captain email steals my whole day.",
    desktopClass: "right-[5%] top-[10%] max-w-[245px] animate-float-y-2",
  },
  {
    text: "What if my message never reaches the bridge?",
    desktopClass: "-right-[6%] top-[43%] max-w-[220px] animate-float-y-3",
  },
  {
    text: "One bad blast could tank our domain's reputation.",
    desktopClass: "bottom-[8%] right-[10%] max-w-[240px] animate-float-y-1",
  },
  {
    text: "Every draft still sounds like spam.",
    desktopClass: "bottom-[10%] left-[13%] max-w-[210px] animate-float-y-2",
  },
  {
    text: "Not sure I'm even talking to the decision-maker.",
    desktopClass: "-left-[6%] top-[45%] max-w-[240px] animate-float-y-3",
  },
];

export function PainPoints() {
  return (
    <section className="relative overflow-hidden bg-black py-32 lg:min-h-[800px] lg:py-40">
      <div className="absolute inset-0 starfield animate-star-pulse opacity-30" aria-hidden />
      <div
        className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black to-transparent"
        aria-hidden
      />
      <div
        className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent"
        aria-hidden
      />

      <div className="relative mx-auto w-full max-w-6xl px-6">
        <div className="relative mx-auto min-h-[600px] max-w-5xl lg:min-h-[620px]">
          <div
            className="pointer-events-none absolute left-[3%] top-1/2 hidden h-[420px] w-[420px] -translate-y-1/2 rounded-full border border-dashed border-white/35 opacity-45 md:block lg:h-[500px] lg:w-[500px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute right-[3%] top-1/2 hidden h-[420px] w-[420px] -translate-y-1/2 rounded-full border border-dashed border-white/35 opacity-45 md:block lg:h-[500px] lg:w-[500px]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.06] bg-white/[0.015] blur-sm md:block"
            aria-hidden
          />

          <div className="relative z-10 flex min-h-[600px] flex-col items-center justify-start text-center md:justify-center">
            <h2 className="max-w-full text-balance text-4xl font-semibold leading-[1.04] tracking-tight text-white sm:text-5xl md:text-6xl md:leading-[1.02] lg:text-[5.25rem]">
              Marine Sale
              <br />
              is <span className="broken-accent">broken</span>.
            </h2>

            <ul className="mt-12 grid w-full max-w-xl gap-3 text-left md:hidden">
              {painPoints.map((point) => (
                <li
                  key={point.text}
                  className="premium-card min-w-0 rounded-xl border border-white/8 bg-white/[0.035] px-4 py-3 font-serif text-xl italic leading-snug text-white/65"
                >
                  {point.text}
                </li>
              ))}
            </ul>

            <div className="mt-12 flex flex-col items-center gap-4 md:absolute md:bottom-0 md:left-1/2 md:-translate-x-1/2">
              <p className="text-sm font-medium text-white/45">
                Learn how to fix it with MariMail
              </p>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-6 text-[15px] font-semibold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/[0.1]"
              >
                <Calendar className="h-4 w-4" />
                Book a Demo
              </Link>
            </div>
          </div>

          {painPoints.map((point) => (
            <p
              key={point.text}
              className={`absolute z-20 hidden font-serif text-2xl italic leading-tight text-white/45 md:block ${point.desktopClass}`}
            >
              {point.text}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

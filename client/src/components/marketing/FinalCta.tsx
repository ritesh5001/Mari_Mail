"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

const rotatingWords = [
  "Find Vessels",
  "Reach Captains",
  "Close Charters",
  "Scale Outreach",
  "Grow Pipeline",
];

export function FinalCta() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setIndex((i) => (i + 1) % rotatingWords.length);
    }, 2200);
    return () => window.clearInterval(t);
  }, []);

  return (
    <section className="relative overflow-hidden bg-black py-24 lg:py-32">
      <div className="absolute inset-0 premium-aurora animate-aurora-drift opacity-70" aria-hidden />
      <div className="mx-auto w-full max-w-6xl px-6 text-center">
        <h2 className="mx-auto max-w-5xl text-balance text-4xl font-semibold tracking-tight text-white md:text-6xl lg:text-[4.25rem] lg:leading-[1.05]">
          <span>Use </span>
          <span>MariMail</span>
          <span> to </span>
          <br className="hidden sm:block" />
          <span key={index} className="violet-accent inline-block animate-[float-y_2.2s_ease-in-out_infinite]">
            {rotatingWords[index]}
          </span>
        </h2>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/book-demo"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#F8FAFC] px-6 text-[15px] font-semibold text-black shadow-[0_14px_44px_rgba(255,255,255,0.12)] transition-all hover:-translate-y-0.5 hover:bg-[#EDEDF0]"
          >
            Start for Free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/book-demo"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-6 text-[15px] font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-white/[0.1]"
          >
            Book a Demo
          </Link>
        </div>

        <p className="mt-5 text-xs text-white/40">
          14-day trial · No credit card · Cancel anytime
        </p>
      </div>
    </section>
  );
}

import Link from "next/link";
import { ArrowRight, Calendar, Star } from "lucide-react";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden bg-black">
      <div className="absolute inset-0 -z-10 starfield animate-star-pulse opacity-70" aria-hidden />
      <div className="absolute inset-0 -z-10 hero-aurora animate-aurora-drift" aria-hidden />
      <div className="absolute inset-0 -z-10 premium-aurora animate-aurora-drift" aria-hidden />
      <div
        className="absolute left-1/2 top-28 -z-10 hidden aspect-square w-[42rem] -translate-x-1/2 rounded-full border border-white/[0.035] md:block animate-slow-spin"
        aria-hidden
      />
      <div
        className="absolute left-1/2 top-40 -z-10 hidden aspect-square w-[30rem] -translate-x-1/2 rounded-full border border-dashed border-accent-600/20 md:block animate-slow-spin"
        aria-hidden
      />
      <div
        className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-black via-black/60 to-transparent"
        aria-hidden
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pb-24 pt-40 text-center lg:pb-32 lg:pt-48">
        <h1 className="max-w-5xl text-balance text-4xl font-semibold leading-[1.06] tracking-tight text-white sm:text-5xl md:text-6xl md:leading-[1.05] lg:text-[5.25rem]">
          Know Which Vessels Need Your Services{" "}
          <span className="violet-accent text-[1.05em]">Before They Arrive at Port</span>
        </h1>

        <p className="mt-7 max-w-2xl text-pretty text-base leading-7 text-white/60 md:text-lg">
          Reach the right ships, superintendents, managers, operators, and
          procurement teams at the right port and the right time with
          MariMail&rsquo;s AI-powered marine intelligence.
        </p>

        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <Link
            href="/book-demo"
            className="group inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#F8FAFC] px-6 text-[15px] font-semibold text-black shadow-[0_14px_44px_rgba(255,255,255,0.12)] transition-all hover:-translate-y-0.5 hover:bg-[#EDEDF0]"
          >
            Start for Free
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
          <Link
            href="/book-demo"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.06] px-6 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/[0.1]"
          >
            <Calendar className="h-4 w-4" />
            Book a Demo
          </Link>
        </div>

        <div className="mt-10 inline-flex items-center gap-2 text-sm text-white/60">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-[#FF492C] text-[10px] font-bold text-white">
            G
          </span>
          <span className="flex items-center gap-1">
            <span className="font-semibold text-white">4.8</span>
            <span>out of 5</span>
            <span className="ml-1 flex items-center gap-0.5 text-amber-400">
              {[0, 1, 2, 3, 4].map((i) => (
                <Star key={i} className="h-3 w-3 fill-current" />
              ))}
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}

"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  ChevronRight,
  LogIn,
  Menu,
  Star,
  X,
} from "lucide-react";
import type { Variants } from "framer-motion";
import { AnimatedGroup } from "@/components/ui/animated-group";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";
import { cn } from "@/lib/cn";

const transitionVariants: { container?: Variants; item?: Variants } = {
  item: {
    hidden: { opacity: 0, filter: "blur(12px)", y: 12 },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      y: 0,
      transition: { type: "spring", bounce: 0.3, duration: 1.5 },
    },
  },
};

const partnerMarks: { name: string; className?: string }[] = [
  { name: "Portside", className: "font-serif italic" },
  { name: "NORDIC BULK", className: "tracking-[0.35em] font-semibold text-xs" },
  { name: "Havre Maritime", className: "font-serif" },
  { name: "Trident Chartering", className: "font-semibold tracking-tight" },
  { name: "BLUE WAVE", className: "tracking-[0.3em] font-semibold text-xs" },
  { name: "MedShip", className: "font-serif italic" },
  { name: "EMERALD FUELS", className: "tracking-[0.35em] font-semibold text-xs" },
  { name: "Gulf Marine", className: "font-semibold tracking-tight" },
];

export function HeroSection() {
  return (
    <>
      <HeroHeader />
      <main className="overflow-hidden bg-black">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 isolate z-[2] hidden opacity-50 contain-strict lg:block"
        >
          <div className="absolute left-0 top-0 h-[80rem] w-[35rem] -translate-y-[350px] -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(220,90%,70%,0.10)_0,hsla(220,80%,55%,0.03)_50%,hsla(220,60%,45%,0)_80%)]" />
          <div className="absolute left-0 top-0 h-[80rem] w-56 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(220,90%,70%,0.06)_0,hsla(220,80%,55%,0.02)_80%,transparent_100%)] [translate:5%_-50%]" />
          <div className="absolute left-0 top-0 h-[80rem] w-56 -translate-y-[350px] -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(220,90%,70%,0.04)_0,hsla(220,80%,55%,0.02)_80%,transparent_100%)]" />
        </div>

        <section className="relative isolate">
          {/* Ambient marine visuals matching the rest of the marketing site */}
          <div
            className="absolute inset-0 -z-10 starfield animate-star-pulse opacity-70"
            aria-hidden
          />
          <div
            className="absolute inset-0 -z-10 hero-aurora animate-aurora-drift"
            aria-hidden
          />
          <div
            className="absolute inset-0 -z-10 premium-aurora animate-aurora-drift"
            aria-hidden
          />
          <div
            className="absolute left-1/2 top-28 -z-10 hidden aspect-square w-[42rem] -translate-x-1/2 rounded-full border border-white/[0.035] md:block animate-slow-spin"
            aria-hidden
          />
          <div
            className="absolute left-1/2 top-40 -z-10 hidden aspect-square w-[30rem] -translate-x-1/2 rounded-full border border-dashed border-accent-600/20 md:block animate-slow-spin"
            aria-hidden
          />

          <div className="relative pt-24 md:pt-36">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 size-full [background:radial-gradient(125%_125%_at_50%_100%,transparent_0%,#000_75%)]"
            />

            <div className="mx-auto max-w-7xl px-6">
              <div className="text-center sm:mx-auto lg:mr-auto lg:mt-0">
                <AnimatedGroup variants={transitionVariants}>
                  <Link
                    href="#product"
                    className="group mx-auto flex w-fit items-center gap-4 rounded-full border border-white/15 bg-white/[0.06] p-1 pl-4 shadow-md shadow-black/20 backdrop-blur transition-all duration-300 hover:bg-white/[0.1]"
                  >
                    <span className="text-sm text-white/80">
                      Introducing MariMail Port Radar
                    </span>
                    <span className="block h-4 w-0.5 bg-white/20" />
                    <div className="size-6 overflow-hidden rounded-full bg-black/60 duration-500 group-hover:bg-black">
                      <div className="flex w-12 -translate-x-1/2 duration-500 ease-in-out group-hover:translate-x-0">
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3 text-white" />
                        </span>
                        <span className="flex size-6">
                          <ArrowRight className="m-auto size-3 text-white" />
                        </span>
                      </div>
                    </div>
                  </Link>

                  <h1 className="mx-auto mt-8 max-w-5xl text-balance text-5xl font-semibold leading-[1.06] tracking-tight text-white sm:text-6xl md:text-7xl lg:mt-16 xl:text-[5.25rem] xl:leading-[1.05]">
                    Know Which Vessels Need Your Services{" "}
                    <span className="violet-accent text-[1.05em]">
                      Before They Arrive at Port
                    </span>
                  </h1>
                  <p className="mx-auto mt-8 max-w-2xl text-pretty text-lg leading-7 text-white/60">
                    Reach the right ships, superintendents, managers, operators,
                    and procurement teams at the right port and the right time
                    with MariMail&rsquo;s AI-powered marine intelligence.
                  </p>
                </AnimatedGroup>

                <AnimatedGroup
                  variants={{
                    container: {
                      visible: {
                        transition: { staggerChildren: 0.05, delayChildren: 0.75 },
                      },
                    },
                    ...transitionVariants,
                  }}
                  className="mt-12 flex flex-col items-center justify-center gap-3 md:flex-row"
                >
                  <Link
                    key={1}
                    href="/book-demo"
                    className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#F8FAFC] px-6 text-[15px] font-semibold text-black shadow-[0_14px_44px_rgba(255,255,255,0.12)] transition-all hover:-translate-y-0.5 hover:bg-[#EDEDF0]"
                  >
                    <span className="text-nowrap">Start for Free</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Link>
                  <Link
                    key={2}
                    href="/book-demo"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-6 text-[15px] font-semibold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/[0.1]"
                  >
                    <Calendar className="h-4 w-4" />
                    <span className="text-nowrap">Book a Demo</span>
                  </Link>
                </AnimatedGroup>

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
            </div>

            <AnimatedGroup
              variants={{
                container: {
                  visible: {
                    transition: { staggerChildren: 0.05, delayChildren: 0.75 },
                  },
                },
                ...transitionVariants,
              }}
            >
              <div className="relative mt-8 -mr-56 overflow-hidden px-2 sm:mr-0 sm:mt-12 md:mt-20">
                <div
                  aria-hidden
                  className="absolute inset-0 z-10 bg-gradient-to-b from-transparent from-35% to-black"
                />
                <div className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-4 shadow-shell ring-1 ring-black/50">
                  {/* Placeholder screenshot — swap for /hero-screenshot.png once available. */}
                  <div className="relative aspect-[15/8] w-full overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-ink-800 via-ink-700 to-ink-800">
                    <img
                      src="/hero-screenshot.png"
                      alt="MariMail app preview"
                      width={2700}
                      height={1440}
                      className="h-full w-full object-cover opacity-90"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="rounded-full border border-white/15 bg-black/40 px-4 py-1.5 text-xs font-medium uppercase tracking-[0.2em] text-white/55 backdrop-blur">
                        Product preview
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </AnimatedGroup>
          </div>
        </section>

        <section className="bg-black pb-16 pt-16 md:pb-24">
          <div className="group relative m-auto max-w-5xl px-6">
            <div className="absolute inset-0 z-10 flex scale-95 items-center justify-center opacity-0 duration-500 group-hover:scale-100 group-hover:opacity-100">
              <Link
                href="/book-demo"
                className="block text-sm text-white/70 duration-150 hover:text-white"
              >
                <span>Meet our early partners</span>
                <ChevronRight className="ml-1 inline-block size-3" />
              </Link>
            </div>

            <p className="text-center text-xs font-semibold uppercase tracking-[0.28em] text-white/40">
              Trusted across the marine desk
            </p>
            <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-x-10 gap-y-6 transition-all duration-500 group-hover:opacity-50 group-hover:blur-[2px] sm:grid-cols-4 sm:gap-x-12 sm:gap-y-8">
              {partnerMarks.map((mark) => (
                <div key={mark.name} className="flex items-center justify-center">
                  <span
                    className={cn(
                      "select-none whitespace-nowrap text-base text-white/55 transition-colors duration-300 hover:text-white",
                      mark.className,
                    )}
                  >
                    {mark.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}

const menuItems = [
  { name: "Features", href: "#product" },
  { name: "Pricing", href: "#pricing" },
  { name: "FAQs", href: "#faqs" },
  { name: "About", href: "/book-demo" },
];

function HeroHeader() {
  const [menuState, setMenuState] = React.useState(false);
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    let frame = 0;
    let last: boolean | null = null;
    const handleScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const next = window.scrollY > 50;
        if (next !== last) {
          last = next;
          setIsScrolled(next);
        }
      });
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header>
      <nav
        data-state={menuState ? "active" : undefined}
        className="group fixed z-50 w-full px-2"
      >
        <div
          className={cn(
            "mx-auto mt-2 max-w-6xl px-6 transition-all duration-500 lg:px-12",
            isScrolled &&
              "max-w-4xl rounded-2xl border border-white/15 bg-black/50 backdrop-blur-lg lg:px-5",
          )}
        >
          <div className="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4">
            <div className="flex w-full justify-between lg:w-auto">
              <Link
                href="/"
                aria-label="MariMail home"
                className="flex items-center gap-2"
              >
                <img
                  src="/logo.png"
                  alt="MariMail"
                  className={cn(
                    "w-auto object-contain transition-all duration-500",
                    isScrolled ? "h-8" : "h-10",
                  )}
                />
              </Link>

              <button
                type="button"
                onClick={() => setMenuState((v) => !v)}
                aria-label={menuState ? "Close menu" : "Open menu"}
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 text-white lg:hidden"
              >
                <Menu
                  className={cn(
                    "m-auto size-6 duration-200",
                    menuState && "scale-0 rotate-180 opacity-0",
                  )}
                />
                <X
                  className={cn(
                    "absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200",
                    menuState && "rotate-0 scale-100 opacity-100",
                  )}
                />
              </button>
            </div>

            <div className="absolute inset-0 m-auto hidden size-fit lg:block">
              <ul className="flex gap-8 text-sm">
                {menuItems.map((item) => (
                  <li key={item.name}>
                    <a
                      href={item.href}
                      className="block text-white/70 duration-150 hover:text-white"
                    >
                      <span>{item.name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div
              className={cn(
                "mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border border-white/10 bg-black/90 p-6 shadow-2xl md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-3 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none",
                menuState && "block",
              )}
            >
              <div className="lg:hidden">
                <ul className="space-y-6 text-base">
                  {menuItems.map((item) => (
                    <li key={item.name}>
                      <a
                        href={item.href}
                        className="block text-white/80 duration-150 hover:text-white"
                        onClick={() => setMenuState(false)}
                      >
                        <span>{item.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex w-full flex-col space-y-3 sm:flex-row sm:items-center sm:gap-2 sm:space-y-0 md:w-fit">
                <div className="hidden lg:block">
                  <ThemeToggle />
                </div>
                <Link
                  href="/login"
                  className={cn(
                    "inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-white/[0.06] px-4 text-[13px] font-semibold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/[0.1]",
                    isScrolled && "lg:hidden",
                  )}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Sign In</span>
                </Link>
                <Link
                  href="/book-demo"
                  className={cn(
                    "inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-white/[0.06] px-4 text-[13px] font-semibold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/[0.1]",
                    isScrolled && "lg:hidden",
                  )}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Book a Demo</span>
                </Link>
                <Link
                  href="/book-demo"
                  className={cn(
                    "hidden h-10 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#F8FAFC] px-4 text-[13px] font-semibold text-black shadow-[0_8px_26px_rgba(255,255,255,0.12)] transition-all hover:-translate-y-0.5 hover:bg-[#EDEDF0]",
                    isScrolled && "lg:inline-flex",
                  )}
                >
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Start for Free</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}

export default HeroSection;

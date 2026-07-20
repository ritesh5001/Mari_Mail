"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Calendar, LogIn, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";

const links = [
  { href: "/", label: "Home" },
  { href: "#product", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faqs", label: "FAQs" },
];

function DesktopNavContent({ scrolled }: { scrolled: boolean }) {
  return (
    <>
      <Link
        href="/"
        className="relative z-10 flex items-center gap-2"
        aria-label="MariMail home"
      >
        <img
          src="/logo.png"
          alt="MariMail"
          className={`w-auto object-contain transition-all duration-500 ${
            scrolled ? "h-9" : "h-10"
          }`}
        />
      </Link>

      <nav
        className={`relative z-10 hidden items-center md:flex transition-[gap] duration-500 ${
          scrolled ? "gap-7" : "gap-10"
        }`}
      >
        {links.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className={`rounded-full px-1 font-medium text-white/70 transition-all duration-500 hover:text-white ${
              scrolled ? "text-[13px]" : "text-sm"
            }`}
          >
            {l.label}
          </a>
        ))}
      </nav>

      <div className="relative z-10 hidden md:grid md:grid-cols-1 md:grid-rows-1 items-center">
        {/* Expanded buttons — visible at top of page */}
        <div
          className={`col-start-1 row-start-1 flex items-center gap-2 transition-all duration-500 ${
            scrolled
              ? "pointer-events-none -translate-y-1 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
        >
          <ThemeToggle />
          <Link
            href="/login"
            className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-white/[0.06] px-4 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/[0.1]"
          >
            <LogIn className="h-3.5 w-3.5" />
            Sign In
          </Link>
          <Link
            href="/book-demo"
            className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/15 bg-white/[0.06] px-4 text-[13px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/[0.1]"
          >
            <Calendar className="h-3.5 w-3.5" />
            Book a Demo
          </Link>
        </div>

        {/* Scrolled (compact) buttons */}
        <div
          className={`col-start-1 row-start-1 flex items-center gap-2 transition-all duration-500 ${
            scrolled
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-1 opacity-0"
          }`}
        >
          <ThemeToggle />
          <Link
            href="/book-demo"
            className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#F8FAFC] px-4 text-[13px] font-semibold text-black shadow-[0_8px_26px_rgba(255,255,255,0.12)] transition-all hover:-translate-y-0.5 hover:bg-[#EDEDF0]"
          >
            <Calendar className="h-3.5 w-3.5" />
            Start For Free
          </Link>
        </div>
      </div>
    </>
  );
}

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Throttle to one read per animation frame, and only flip state when the
    // boolean actually changes — otherwise a scroll fires setScrolled dozens
    // of times per second for no visual change.
    let frame = 0;
    let lastValue: boolean | null = null;
    function onScroll() {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const next = window.scrollY > 24;
        if (next !== lastValue) {
          lastValue = next;
          setScrolled(next);
        }
      });
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center">
      <div
        className={`group pointer-events-auto relative flex w-full items-center justify-between gap-3 overflow-visible border backdrop-blur-2xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          scrolled
            ? "glass-shell mt-4 max-w-[49rem] rounded-full border-white/20 bg-black/45 px-2.5 py-2 shadow-[0_20px_70px_rgba(0,0,0,0.55)]"
            : "mt-0 max-w-[100vw] rounded-none border-x-0 border-b border-white/10 bg-black/40 px-8 py-4 shadow-none"
        }`}
      >
        <DesktopNavContent scrolled={scrolled} />

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white md:hidden"
          aria-label="Toggle menu"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="pointer-events-auto absolute left-4 right-4 top-16 rounded-2xl border border-white/10 bg-black/90 p-4 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col gap-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-white/80"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/book-demo"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex h-10 items-center justify-center rounded-full bg-[#F8FAFC] text-sm font-semibold text-black"
            >
              Start For Free
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

import { Info } from "lucide-react";

/**
 * An (i) beside a heading that reveals an explanation on hover or focus.
 *
 * The explanations these replace used to sit permanently under every heading,
 * which meant a page a user visits daily spent a third of its space telling
 * them something they learned on day one. The information still has to be
 * reachable — some of it is genuinely non-obvious, like what a company block
 * does to already-queued sends — so it moves behind a deliberate gesture
 * instead of being deleted.
 *
 * No "use client": this is a CSS-only tooltip, so it works inside the server
 * components most of these pages are, and costs no JavaScript.
 *
 * Focus-visible as well as hover, because a keyboard user has no pointer to
 * hover with, and `title` alone is unreachable for them.
 */
export function InfoHint({
  children,
  label = "More information",
  align = "left",
}: {
  children: React.ReactNode;
  /** Screen-reader name for the trigger. */
  label?: string;
  /** Which edge the panel hangs from — flip it near the right edge. */
  align?: "left" | "right";
}) {
  return (
    <span className="group relative inline-flex shrink-0 items-center align-middle">
      <button
        type="button"
        aria-label={label}
        className="rounded-full p-0.5 text-slate-400 outline-none transition hover:text-ocean focus-visible:ring-2 focus-visible:ring-accent-500/40 dark:text-white/35 dark:hover:text-accent-300"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none invisible absolute top-full z-50 mt-1.5 w-72 rounded-lg border border-slate-200 bg-white p-2.5 text-left text-xs font-normal leading-relaxed text-slate-600 opacity-0 shadow-lg transition-opacity duration-100 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 dark:border-white/10 dark:bg-[#15151a] dark:text-white/70 ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {children}
      </span>
    </span>
  );
}

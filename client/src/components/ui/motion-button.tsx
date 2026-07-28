"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * MotionButton — the primary/"most important" action on a screen.
 *
 * Adapted from the shadcn motion-button to MariMail:
 *  - `@/lib/cn` (not the pasted local cn), brand-blue instead of `--primary`.
 *  - Renders as a real <button> so it keeps type/disabled/onClick semantics
 *    (the pasted version was display-only).
 *  - A brand-blue circle sits at the left; on hover it expands to fill the
 *    pill and the label flips to white, with the arrow nudging right.
 *  - `size="sm"` fits dense dashboard toolbars; `size="lg"` for hero CTAs.
 *
 * Use this ONLY for the single most important action on a view (Add to List,
 * Search, Launch campaign, hero CTA). Secondary actions stay as outline/ghost
 * buttons — highlighting everything highlights nothing.
 */

const SIZES = {
  sm: {
    pad: "p-1",
    circle: "h-8 w-8",
    icon: "size-4",
    iconPos: "left-2",
    text: "text-sm px-4 pl-9",
    minH: "min-h-[2.5rem]",
  },
  md: {
    pad: "p-1.5",
    circle: "h-10 w-10",
    icon: "size-5",
    iconPos: "left-2.5",
    text: "text-base px-6 pl-12",
    minH: "min-h-[3.25rem]",
  },
  lg: {
    pad: "p-2",
    circle: "h-12 w-12",
    icon: "size-6",
    iconPos: "left-3",
    text: "text-lg px-8 pl-14",
    minH: "min-h-[4rem]",
  },
} as const;

const shell = (size: keyof typeof SIZES, className?: string) =>
  cn(
    "group relative inline-flex cursor-pointer items-center overflow-hidden rounded-full bg-white outline-none",
    "border border-accent-500/40 shadow-[0_2px_10px_rgba(79,109,255,0.18)]",
    "transition-[box-shadow,transform] duration-300 hover:shadow-[0_8px_28px_rgba(79,109,255,0.35)] hover:-translate-y-0.5",
    "focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none",
    "dark:bg-white/[0.04] dark:border-accent-400/40",
    SIZES[size].pad,
    SIZES[size].minH,
    className,
  );

function Inner({
  size,
  icon,
  label,
}: {
  size: keyof typeof SIZES;
  icon?: React.ReactNode;
  label: string;
}) {
  const s = SIZES[size];
  return (
    <>
      {/* Expanding brand-blue circle */}
      <span
        aria-hidden
        className={cn(
          "block flex-shrink-0 rounded-full bg-gradient-to-br from-accent-500 to-accent-600 duration-500 group-hover:w-full",
          s.circle,
        )}
      />
      {/* Icon inside the circle */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 -translate-y-1/2 text-white duration-500 group-hover:translate-x-1",
          s.iconPos,
        )}
      >
        {icon ?? <ArrowRight className={s.icon} />}
      </span>
      {/* Label — flips to white as the circle fills */}
      <span
        className={cn(
          "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-center font-semibold tracking-tight duration-500",
          "text-accent-600 group-hover:text-white dark:text-accent-300 dark:group-hover:text-white",
          s.text,
        )}
      >
        {label}
      </span>
    </>
  );
}

export interface MotionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: keyof typeof SIZES;
  /** Icon shown inside the circle. Defaults to an arrow. */
  icon?: React.ReactNode;
  /** When set, renders a Next.js <Link> instead of a <button>. */
  href?: string;
}

export const MotionButton = React.forwardRef<HTMLButtonElement, MotionButtonProps>(
  ({ label, size = "md", icon, className, disabled, href, ...props }, ref) => {
    if (href) {
      return (
        <Link href={href} className={shell(size, className)}>
          <Inner size={size} icon={icon} label={label} />
        </Link>
      );
    }
    return (
      <button ref={ref} disabled={disabled} className={shell(size, className)} {...props}>
        <Inner size={size} icon={icon} label={label} />
      </button>
    );
  },
);
MotionButton.displayName = "MotionButton";

export default MotionButton;

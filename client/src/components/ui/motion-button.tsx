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

// Each size defines: overall pill height, the resting circle diameter, icon
// size, and how far the label is padded so it clears the resting circle on the
// left and has breathing room on the right.
const SIZES = {
  sm: {
    height: "h-9",
    circle: "h-7 w-7",
    circleInset: "left-1 top-1",
    icon: "size-4",
    iconLeft: "left-[0.6rem]",
    text: "text-sm pl-10 pr-4",
  },
  md: {
    height: "h-12",
    circle: "h-10 w-10",
    circleInset: "left-1 top-1",
    icon: "size-5",
    iconLeft: "left-[0.8rem]",
    text: "text-base pl-14 pr-6",
  },
  lg: {
    height: "h-14",
    circle: "h-12 w-12",
    circleInset: "left-1 top-1",
    icon: "size-6",
    iconLeft: "left-[0.9rem]",
    text: "text-lg pl-16 pr-8",
  },
} as const;

// Tone tokens: default brand-blue, plus green for "go live / launch" actions.
const TONES = {
  blue: {
    border: "border-accent-500/40 dark:border-accent-400/40",
    shadow: "shadow-[0_2px_10px_rgba(79,109,255,0.18)] hover:shadow-[0_8px_28px_rgba(79,109,255,0.35)]",
    ring: "focus-visible:ring-accent-500/50",
    label: "text-accent-600 group-hover:text-white dark:text-accent-300 dark:group-hover:text-white",
    circle: "from-accent-500 to-accent-600",
  },
  green: {
    border: "border-emerald-500/40 dark:border-emerald-400/40",
    shadow: "shadow-[0_2px_10px_rgba(16,185,129,0.20)] hover:shadow-[0_8px_28px_rgba(16,185,129,0.4)]",
    ring: "focus-visible:ring-emerald-500/50",
    label: "text-emerald-600 group-hover:text-white dark:text-emerald-300 dark:group-hover:text-white",
    circle: "from-emerald-500 to-emerald-600",
  },
} as const;

const shell = (size: keyof typeof SIZES, tone: keyof typeof TONES, className?: string) =>
  cn(
    "group relative inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-full bg-white outline-none border",
    "transition-[box-shadow,transform] duration-300 hover:-translate-y-0.5",
    "focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none",
    "dark:bg-white/[0.04]",
    TONES[tone].border,
    TONES[tone].shadow,
    TONES[tone].ring,
    SIZES[size].height,
    className,
  );

function Inner({
  size,
  tone,
  icon,
  label,
}: {
  size: keyof typeof SIZES;
  tone: keyof typeof TONES;
  icon?: React.ReactNode;
  label: string;
}) {
  const s = SIZES[size];
  const t = TONES[tone];
  return (
    <>
      {/* Label sits in normal flow so the pill is always wide enough to hold
          it; left padding clears the resting circle. Flips to white as the
          circle sweeps across on hover. */}
      <span
        className={cn(
          "relative z-10 whitespace-nowrap font-semibold tracking-tight duration-500",
          t.label,
          s.text,
        )}
      >
        {label}
      </span>
      {/* Circle: absolute overlay pinned left, grows to fill the whole pill on
          hover. */}
      <span
        aria-hidden
        className={cn(
          "absolute rounded-full bg-gradient-to-br duration-500",
          "group-hover:left-0 group-hover:top-0 group-hover:h-full group-hover:w-full group-hover:rounded-full",
          t.circle,
          s.circleInset,
          s.circle,
        )}
      />
      {/* Icon rides on top of the circle, nudges right on hover. Force pure
          white via an arbitrary value + [&_svg]:text so custom icons inherit it
          — the marketing `.text-white → dark ink` light-mode override can't flip
          `text-[#ffffff]`, so the arrow stays white on the light hero too. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 z-20 -translate-y-1/2 text-[#ffffff] [&_svg]:text-[#ffffff] duration-500 group-hover:translate-x-1",
          s.iconLeft,
        )}
      >
        {icon ?? <ArrowRight className={s.icon} />}
      </span>
    </>
  );
}

export interface MotionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  size?: keyof typeof SIZES;
  /** Color tone: brand-blue (default) or green for "go live / launch" actions. */
  tone?: keyof typeof TONES;
  /** Icon shown inside the circle. Defaults to an arrow. */
  icon?: React.ReactNode;
  /** When set, renders a Next.js <Link> instead of a <button>. */
  href?: string;
}

export const MotionButton = React.forwardRef<HTMLButtonElement, MotionButtonProps>(
  ({ label, size = "md", tone = "blue", icon, className, disabled, href, ...props }, ref) => {
    if (href) {
      return (
        <Link href={href} className={shell(size, tone, className)}>
          <Inner size={size} tone={tone} icon={icon} label={label} />
        </Link>
      );
    }
    return (
      <button ref={ref} disabled={disabled} className={shell(size, tone, className)} {...props}>
        <Inner size={size} tone={tone} icon={icon} label={label} />
      </button>
    );
  },
);
MotionButton.displayName = "MotionButton";

export default MotionButton;

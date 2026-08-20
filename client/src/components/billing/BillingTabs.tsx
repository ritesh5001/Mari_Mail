"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/dashboard/billing", label: "Plan" },
  { href: "/dashboard/billing/credits", label: "Credits" },
] as const;

/**
 * Plan / Credits switch for the billing section.
 *
 * Exact-match on the pathname rather than `startsWith`: /dashboard/billing is
 * a prefix of every tab's href, so a prefix test would light up Plan on every
 * page in the section.
 */
export function BillingTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-slate-200 dark:border-white/[0.08]">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
              active
                ? "border-accent-500 text-accent-600 dark:text-accent-300"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-white/50 dark:hover:border-white/20 dark:hover:text-white/80",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Ban,
  Columns3,
  Radar,
  ShieldCheck,
  Timer,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Settings is grouped by what the reader is trying to change, not by which
 * table the data happens to live in:
 *
 *   You         — your own account and the devices signed into it
 *   Workspace   — rules that apply to everyone here, and to every campaign
 *   Display     — per-person presentation, saved on this device
 */
const SECTIONS = [
  {
    label: "You",
    items: [
      { href: "/dashboard/settings/profile", label: "Profile", icon: UserRound },
      { href: "/dashboard/settings/security", label: "Security", icon: ShieldCheck },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/dashboard/settings/personas", label: "Personas", icon: Users },
      { href: "/dashboard/settings/blocked", label: "Blocked", icon: Ban },
      { href: "/dashboard/settings/sending", label: "Sending defaults", icon: Timer },
      { href: "/dashboard/settings/port-rules", label: "Port rules", icon: Radar },
      { href: "/dashboard/settings/cargo-rules", label: "Cargo rules", icon: Workflow },
    ],
  },
  {
    label: "Display",
    items: [{ href: "/dashboard/settings/columns", label: "Table columns", icon: Columns3 }],
  },
] as const;

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className="shrink-0 lg:w-56">
      {SECTIONS.map((section) => (
        <div key={section.label} className="mb-5 last:mb-0">
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/35">
            {section.label}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                      active
                        ? "bg-accent-500/10 font-semibold text-accent-700 dark:text-accent-300"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-white/60 dark:hover:bg-white/[0.05] dark:hover:text-white",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";

export type CustomizableNavItem = {
  href: string;
  label: string;
  icon: typeof SlidersHorizontal;
};

export function SidebarCustomizePanel({
  items,
  hidden,
  onChange,
}: {
  items: CustomizableNavItem[];
  hidden: string[];
  onChange: (hidden: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  async function toggle(href: string) {
    const next = hidden.includes(href) ? hidden.filter((h) => h !== href) : [...hidden, href];
    setPending(href);
    onChange(next);
    try {
      await apiFetch("/auth/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hiddenNavItems: next }),
      });
    } finally {
      setPending(null);
    }
  }

  if (items.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative mx-auto flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:text-white/55 dark:hover:bg-white/[0.06] dark:hover:text-white"
        aria-label="Customize sidebar"
      >
        <SlidersHorizontal className="h-[18px] w-[18px]" />
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 opacity-0 shadow-[0_12px_28px_rgba(15,23,42,0.14)] transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 dark:border-white/10 dark:bg-[#15131c] dark:text-white dark:shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
          Customize sidebar
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-[0_24px_60px_rgba(15,23,42,0.2)] dark:border-white/10 dark:bg-[#0F0D14]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-950 dark:text-white">Customize sidebar</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-white/50 dark:hover:bg-white/[0.06] dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-white/50">
              Hide tabs you don&apos;t use. This only affects your own view.
            </p>

            <div className="mt-4 max-h-80 space-y-1 overflow-y-auto">
              {items.map((item) => {
                const Icon = item.icon;
                const isHidden = hidden.includes(item.href);
                return (
                  <label
                    key={item.href}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 text-sm hover:bg-slate-50 dark:hover:bg-white/[0.05]"
                  >
                    <span className="flex items-center gap-2 text-slate-700 dark:text-white/80">
                      <Icon className="h-4 w-4 text-slate-400 dark:text-white/40" />
                      {item.label}
                    </span>
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      disabled={pending === item.href}
                      onChange={() => toggle(item.href)}
                      className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-white/20"
                    />
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

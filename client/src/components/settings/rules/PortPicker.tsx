"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";
import { apiFetch } from "@/lib/browser-fetch";
import { cn } from "@/lib/cn";

export type PortOption = {
  portCode: string;
  portName: string;
  country?: string;
  countryName?: string;
};

/**
 * Type-to-search port chooser.
 *
 * Replaces a native `<select>` that was fed the entire port registry — 10,928
 * `<option>` elements, every column of every row, on every page load. Beyond
 * the payload, a native select of that size has no search: finding "Kandla"
 * meant scrolling a list the length of a phone book, and the only way to know
 * a port existed was to already know its name.
 *
 * Ports come from `/workspaces/ports`, which is country-scoped and cached
 * server-side. That is also the more correct source: a rule for a port the
 * workspace's plan doesn't cover could never fire, so offering it was a
 * promise the product couldn't keep.
 */
export function PortPicker({
  value,
  onChange,
  id,
}: {
  value: PortOption | null;
  onChange: (port: PortOption | null) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [ports, setPorts] = useState<PortOption[] | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/workspaces/ports")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { data?: PortOption[] } | null) => {
        if (!cancelled) setPorts(payload?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setPorts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const results = useMemo(() => {
    const all = ports ?? [];
    const term = query.trim().toLowerCase();
    // Capped at 50 rendered rows. Someone scrolling past fifty near-matches is
    // not finding their port by scrolling — they need a better search term.
    if (!term) return all.slice(0, 50);
    return all
      .filter(
        (port) =>
          port.portName.toLowerCase().includes(term) ||
          port.portCode.toLowerCase().includes(term) ||
          (port.countryName ?? "").toLowerCase().includes(term),
      )
      .slice(0, 50);
  }, [ports, query]);

  return (
    <div className="relative" ref={wrapper}>
      <button
        type="button"
        id={id}
        onClick={() => {
          setOpen((v) => !v);
          requestAnimationFrame(() => input.current?.focus());
        }}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 px-3 py-2 text-left text-sm text-slate-900 transition-colors hover:border-accent-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
      >
        {value ? (
          <span className="min-w-0 truncate">
            {value.portName}{" "}
            <span className="text-slate-400 dark:text-white/35">({value.portCode})</span>
          </span>
        ) : (
          <span className="text-slate-400 dark:text-white/35">Search for a port…</span>
        )}
        <span className="flex shrink-0 items-center gap-1">
          {value ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear port"
              onClick={(event) => {
                event.stopPropagation();
                onChange(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.stopPropagation();
                  onChange(null);
                }
              }}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.08]"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <ChevronDown className="h-4 w-4 text-slate-400 dark:text-white/35" />
        </span>
      </button>

      {open ? (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#0F0D14]">
          <div className="relative border-b border-slate-100 dark:border-white/[0.06]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              ref={input}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Port name, code or country"
              className="w-full bg-transparent py-2 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
            />
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {ports === null ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            ) : results.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-slate-500 dark:text-white/45">
                {ports.length === 0
                  ? "No ports available. Your plan's country access decides which ports you can build rules for."
                  : "No port matches that search."}
              </p>
            ) : (
              results.map((port) => {
                const selected = value?.portCode === port.portCode;
                return (
                  <button
                    key={port.portCode}
                    type="button"
                    onClick={() => {
                      onChange(port);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                      selected
                        ? "bg-accent-500/10 text-accent-700 dark:text-accent-300"
                        : "text-slate-700 hover:bg-slate-50 dark:text-white/75 dark:hover:bg-white/[0.05]",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {port.portName}
                      <span className="ml-1.5 text-xs text-slate-400 dark:text-white/35">
                        {port.portCode}
                        {port.countryName ? ` · ${port.countryName}` : ""}
                      </span>
                    </span>
                    {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { Mail, Search, Ship, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/browser-fetch";

const items = [
  { type: "Vessel", label: "MV Pacific Eagle", detail: "IMO 9781234", icon: Ship, href: "/dashboard/vessels/9781234" },
  { type: "Contact", label: "Captain James Ward", detail: "Fleet Manager", icon: UserRound, href: "/dashboard/contacts" },
  { type: "Campaign", label: "Fujairah Hold Cleaning", detail: "ETA sequence", icon: Mail, href: "/dashboard/campaigns" },
];

type SearchHit = {
  id: string;
  type: "VESSEL" | "CONTACT" | "SHIP_OWNER" | "ISM_MANAGER" | "COMMERCIAL_MANAGER";
  title: string;
  subtitle: string | null;
  href: string;
};

const icons = {
  VESSEL: Ship,
  CONTACT: UserRound,
  SHIP_OWNER: UserRound,
  ISM_MANAGER: UserRound,
  COMMERCIAL_MANAGER: UserRound,
} as const;

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [hits, setHits] = useState<SearchHit[]>([]);

  const results = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    if (hits.length > 0) {
      return hits.map((hit) => ({
        type: hit.type.replaceAll("_", " "),
        label: hit.title,
        detail: hit.subtitle ?? "Search result",
        icon: icons[hit.type],
        href: hit.href,
      }));
    }
    if (!normalized) return items;
    return items.filter((item) => `${item.type} ${item.label} ${item.detail}`.toLowerCase().includes(normalized));
  }, [hits, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelected(0);
      setHits([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setHits([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      apiFetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: { data?: { hits?: SearchHit[] } } | null) => {
          setHits(payload?.data?.hits ?? []);
        })
        .catch(() => undefined);
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!open) return;
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((value) => Math.min(value + 1, Math.max(results.length - 1, 0)));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((value) => Math.max(value - 1, 0));
      }
      if (event.key === "Enter" && results[selected]) {
        window.location.href = results[selected].href;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, results, selected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/30 px-4 pt-24" onMouseDown={onClose}>
      <div
        className="mx-auto w-full max-w-2xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-shell"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelected(0);
            }}
            className="h-10 flex-1 border-0 bg-transparent text-base outline-none"
            placeholder="Search MariMail"
          />
        </div>
        <div className="max-h-96 overflow-y-auto p-2">
          {results.map((item, index) => {
            const Icon = item.icon;
            return (
              <a
                key={`${item.type}-${item.label}`}
                href={item.href}
                className={
                  index === selected
                    ? "flex items-center gap-3 rounded-md bg-navy px-3 py-3 text-white"
                    : "flex items-center gap-3 rounded-md px-3 py-3 text-slate-700 hover:bg-slate-100"
                }
              >
                <Icon className="h-5 w-5" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.label}</span>
                  <span className={index === selected ? "block truncate text-xs text-blue-100" : "block truncate text-xs text-slate-500"}>
                    {item.type} - {item.detail}
                  </span>
                </span>
              </a>
            );
          })}
          {results.length === 0 ? <p className="px-3 py-8 text-center text-sm text-slate-500">No results</p> : null}
        </div>
      </div>
    </div>
  );
}

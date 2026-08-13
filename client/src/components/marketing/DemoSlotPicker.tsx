"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock, Loader2 } from "lucide-react";
import { apiUrl } from "@/lib/client-api";

export type SlotView = { startUtc: string; istTime: string; istEndTime: string };
export type DayView = {
  date: string;
  weekdayShort: string;
  weekdayLong: string;
  label: string;
  slots: SlotView[];
};

type SlotsResponse = {
  enabled: boolean;
  timezone: string;
  slotMinutes: number;
  businessHours: { start: number; end: number };
  horizonDays: number;
  days: DayView[];
};

/**
 * The viewer's own clock time for a slot, e.g. "6:00 AM".
 *
 * Shown only as a secondary caption. The booking is deliberately expressed in
 * India time — those are the hours the team is actually at their desks — and
 * leading with the visitor's local time would bury that. But someone in
 * California still needs to know a 09:30 IST call lands at 9pm their previous
 * evening, so the conversion is offered rather than hidden.
 */
function localEquivalent(startUtc: string) {
  try {
    return new Date(startUtc).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function localZoneName() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

/** True when the viewer is already on India time, making the caption noise. */
function viewerIsOnIst() {
  // getTimezoneOffset is minutes BEHIND UTC, so IST (UTC+5:30) reports -330.
  return new Date().getTimezoneOffset() === -330;
}

export function DemoSlotPicker({
  value,
  onChange,
  onLoadState,
}: {
  value: string | null;
  onChange: (startUtc: string | null) => void;
  onLoadState?: (state: { loading: boolean; enabled: boolean; hasSlots: boolean }) => void;
}) {
  const [data, setData] = useState<SlotsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [showLocal, setShowLocal] = useState(false);

  useEffect(() => {
    // Only decide about the local-time caption in the browser, so the server
    // render and the first client render agree.
    setShowLocal(!viewerIsOnIst());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/demo/slots`, { cache: "no-store" });
        if (!res.ok) throw new Error("bad status");
        const payload = (await res.json()) as { data?: SlotsResponse };
        if (cancelled || !payload.data) return;
        setData(payload.data);
        setActiveDate(payload.data.days[0]?.date ?? null);
      } catch {
        if (!cancelled) setError("Couldn't load available times. Please refresh and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const day = useMemo(
    () => data?.days.find((d) => d.date === activeDate) ?? null,
    [data, activeDate],
  );

  useEffect(() => {
    onLoadState?.({
      loading,
      enabled: data?.enabled ?? true,
      hasSlots: (data?.days.length ?? 0) > 0,
    });
  }, [loading, data, onLoadState]);

  // If the selected slot isn't on the visible day any more, drop it so the form
  // can't submit a time the person can no longer see.
  useEffect(() => {
    if (!value || !day) return;
    if (!day.slots.some((s) => s.startUtc === value)) onChange(null);
  }, [day, value, onChange]);

  const zone = localZoneName();

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/50">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading available times…
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
        {error}
      </p>
    );
  }

  if (!data?.enabled || data.days.length === 0) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        No demo slots are open right now. Please email us and we&rsquo;ll arrange a time.
      </p>
    );
  }

  return (
    // min-w-0 on every level that contains the scrolling date strip: an ancestor
    // flex/grid item defaults to min-width:auto and will otherwise size itself to
    // the strip's full unscrolled width instead of letting it scroll.
    <div className="min-w-0 space-y-3">
      {/* The timezone is stated once, prominently, and repeated on every slot
          button's label — a visitor should never have to guess whose clock
          these times belong to. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-500/30 dark:bg-sky-500/10">
        <p className="text-xs font-medium text-sky-900 dark:text-sky-200">
          All times shown in <strong>{data.timezone}</strong> — our team&rsquo;s working hours
        </p>
        <p className="text-[11px] text-sky-800/80 dark:text-sky-200/70">
          Mon–Fri, {String(data.businessHours.start).padStart(2, "0")}:00–{data.businessHours.end}:00
        </p>
      </div>

      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-white/70">
          <CalendarDays className="h-3.5 w-3.5" /> Pick a date
        </p>
        <div className="flex w-full min-w-0 snap-x gap-2 overflow-x-auto pb-1">
          {data.days.map((d) => {
            const active = d.date === activeDate;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => setActiveDate(d.date)}
                aria-pressed={active}
                className={`w-[4.75rem] shrink-0 snap-start rounded-lg border px-2 py-2 text-center transition ${
                  active
                    ? "border-sky-500 bg-sky-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:border-sky-400/40"
                }`}
              >
                <span className="block text-[11px] font-medium opacity-80">{d.weekdayShort}</span>
                <span className="block text-sm font-semibold">{d.label.split(" ").slice(0, 2).join(" ")}</span>
                <span className="block text-[10px] opacity-70">
                  {d.slots.length} slot{d.slots.length === 1 ? "" : "s"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {day ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-white/70">
            <Clock className="h-3.5 w-3.5" /> Pick a time on {day.weekdayLong} {day.label}
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {day.slots.map((slot) => {
              const active = slot.startUtc === value;
              const local = showLocal ? localEquivalent(slot.startUtc) : null;
              return (
                <button
                  key={slot.startUtc}
                  type="button"
                  onClick={() => onChange(active ? null : slot.startUtc)}
                  aria-pressed={active}
                  aria-label={`${slot.istTime} to ${slot.istEndTime} ${data.timezone}${local ? `, ${local} your time` : ""}`}
                  className={`rounded-lg border px-2 py-2 text-center transition ${
                    active
                      ? "border-sky-500 bg-sky-600 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-800 hover:border-sky-300 hover:bg-sky-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/85 dark:hover:border-sky-400/40"
                  }`}
                >
                  <span className="block text-sm font-semibold tabular-nums">{slot.istTime}</span>
                  <span className={`block text-[10px] ${active ? "text-white/75" : "text-slate-400 dark:text-white/40"}`}>
                    IST
                  </span>
                  {local ? (
                    <span className={`mt-0.5 block text-[10px] tabular-nums ${active ? "text-white/70" : "text-slate-400 dark:text-white/35"}`}>
                      {local} local
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          {showLocal && zone ? (
            <p className="mt-2 text-[11px] text-slate-500 dark:text-white/40">
              &ldquo;local&rdquo; is your device timezone ({zone}). The demo runs at the IST time shown above.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

type BookingStatus = "PENDING" | "CONTACTED" | "SCHEDULED" | "COMPLETED" | "CANCELLED";

export type CalendarBooking = {
  id: string;
  name: string;
  company: string | null;
  status: BookingStatus;
  scheduledAt: string | null;
  preferredAt: string | null;
};

/** Dot colour per status, matching the badges used in the list. */
const STATUS_DOT: Record<BookingStatus, string> = {
  PENDING: "bg-amber-500",
  CONTACTED: "bg-sky-500",
  SCHEDULED: "bg-sky-500",
  COMPLETED: "bg-emerald-500",
  CANCELLED: "bg-slate-400",
};

const IST = "Asia/Kolkata";

/**
 * The IST calendar day an instant falls on, as "YYYY-MM-DD".
 *
 * Grouping by IST rather than the viewer's locale is the whole point: slots are
 * offered, agreed and stored in India business hours, so a 09:30 IST demo is
 * the 18th for everyone involved. Bucketing by local time would file it under
 * the 17th for an admin in New York and quietly shift the whole month.
 */
function istDayKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function istTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/** Weekday index (0 = Mon) for a calendar date, evaluated in IST. */
function weekdayIndex(year: number, month: number, day: number): number {
  // Noon UTC is 17:30 IST the same day, so the date can't slip either way.
  const probe = new Date(Date.UTC(year, month, day, 12));
  const short = new Intl.DateTimeFormat("en-GB", { timeZone: IST, weekday: "short" }).format(probe);
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(short);
}

function dayKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Month view of booked demos.
 *
 * Answers the question the list cannot: how the coming weeks actually look —
 * which days are stacked, which are free, and whether anything is booked at
 * all this week. Selecting a day filters the list beside it, so the calendar
 * is a way into the bookings rather than a second place to read them.
 */
export function DemoBookingCalendar({
  bookings,
  selectedDay,
  onSelectDay,
}: {
  bookings: CalendarBooking[];
  /** "YYYY-MM-DD" in IST, or null for no day filter. */
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
}) {
  const todayKey = istDayKey(new Date().toISOString());
  const [year, setYear] = useState(() => Number(todayKey.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(todayKey.slice(5, 7)) - 1);

  // Bookings bucketed by IST day. A booking with no confirmed slot falls back
  // to its requested time so requests still show up as something to schedule.
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const booking of bookings) {
      const when = booking.scheduledAt ?? booking.preferredAt;
      if (!when) continue;
      const key = istDayKey(when);
      const list = map.get(key);
      if (list) list.push(booking);
      else map.set(key, [booking]);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.scheduledAt ?? a.preferredAt ?? "").localeCompare(b.scheduledAt ?? b.preferredAt ?? ""));
    }
    return map;
  }, [bookings]);

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadingBlanks = weekdayIndex(year, month, 1);
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month, 15, 12)));

  // Bookings with no slot AND no requested time can't be placed anywhere. They
  // are the majority of older rows, so the calendar says so rather than
  // implying the month is all there is.
  const undated = useMemo(
    () => bookings.filter((b) => !b.scheduledAt && !b.preferredAt).length,
    [bookings],
  );

  const monthCount = useMemo(() => {
    let n = 0;
    for (let day = 1; day <= daysInMonth; day += 1) n += byDay.get(dayKey(year, month, day))?.length ?? 0;
    return n;
  }, [byDay, daysInMonth, year, month]);

  function shiftMonth(delta: number) {
    const next = new Date(Date.UTC(year, month + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth());
  }

  function goToday() {
    setYear(Number(todayKey.slice(0, 4)));
    setMonth(Number(todayKey.slice(5, 7)) - 1);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#0a0a0c]">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/[0.06]">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <CalendarDays className="h-4 w-4 text-ocean" />
          {monthLabel}
        </h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-white/60">
          {monthCount} {monthCount === 1 ? "demo" : "demos"}
        </span>
        <span className="text-[11px] text-slate-400 dark:text-white/35">times in IST</span>
        {undated > 0 ? (
          <span
            className="text-[11px] text-slate-400 dark:text-white/35"
            title="These have no confirmed slot and no requested time, so there is no day to place them on. They are in the list below."
          >
            · {undated} undated
          </span>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-white/50 dark:hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="rounded-md p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-white/50 dark:hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="p-3">
        <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/35">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
            <div key={label}>{label}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const key = dayKey(year, month, day);
            const dayBookings = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            const isSelected = key === selectedDay;
            const hasBookings = dayBookings.length > 0;

            return (
              <button
                key={key}
                type="button"
                // A day with nothing on it is not a filter worth applying.
                disabled={!hasBookings}
                onClick={() => onSelectDay(isSelected ? null : key)}
                title={
                  hasBookings
                    ? dayBookings
                        .map((b) => `${istTime(b.scheduledAt ?? b.preferredAt ?? "")} — ${b.name}${b.company ? ` (${b.company})` : ""}`)
                        .join("\n")
                    : undefined
                }
                className={cn(
                  "flex min-h-[62px] flex-col items-start gap-1 rounded-md border p-1.5 text-left transition",
                  isSelected
                    ? "border-ocean bg-ocean/[0.07] dark:border-accent-400/60"
                    : hasBookings
                      ? "border-slate-200 hover:border-ocean/50 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/[0.04]"
                      : "border-transparent",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-[11px]",
                    isToday
                      ? "bg-ocean font-bold text-white"
                      : hasBookings
                        ? "font-semibold text-slate-800 dark:text-white/85"
                        : "text-slate-400 dark:text-white/30",
                  )}
                >
                  {day}
                </span>

                {/* One dot per booking, capped so a busy day stays a cell and
                    not a wall — the count carries the rest. */}
                {hasBookings ? (
                  <span className="flex flex-wrap items-center gap-0.5">
                    {dayBookings.slice(0, 4).map((booking) => (
                      <span
                        key={booking.id}
                        className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[booking.status])}
                      />
                    ))}
                    {dayBookings.length > 4 ? (
                      <span className="text-[10px] font-medium text-slate-500 dark:text-white/45">
                        +{dayBookings.length - 4}
                      </span>
                    ) : null}
                  </span>
                ) : null}

                {hasBookings ? (
                  <span className="truncate text-[10px] leading-tight text-slate-500 dark:text-white/45">
                    {istTime(dayBookings[0].scheduledAt ?? dayBookings[0].preferredAt ?? "")}
                    {dayBookings.length > 1 ? ` +${dayBookings.length - 1}` : ""}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDay ? (
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2 text-xs dark:border-white/[0.06]">
          <span className="text-slate-600 dark:text-white/60">
            Showing {byDay.get(selectedDay)?.length ?? 0} on{" "}
            {new Intl.DateTimeFormat("en-GB", {
              timeZone: IST,
              weekday: "short",
              day: "numeric",
              month: "short",
            }).format(new Date(`${selectedDay}T06:00:00Z`))}
          </span>
          <button
            type="button"
            onClick={() => onSelectDay(null)}
            className="font-medium text-sky-600 hover:underline dark:text-accent-300"
          >
            Show all
          </button>
        </div>
      ) : null}
    </section>
  );
}

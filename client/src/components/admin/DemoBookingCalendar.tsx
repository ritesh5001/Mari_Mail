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
  CONTACTED: "bg-accent-500",
  SCHEDULED: "bg-accent-500",
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
  onOpenBooking,
}: {
  bookings: CalendarBooking[];
  /** "YYYY-MM-DD" in IST, or null for no day filter. */
  selectedDay: string | null;
  onSelectDay: (day: string | null) => void;
  /** Open a booking's detail panel from its row in the calendar. */
  onOpenBooking?: (id: string) => void;
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
  const undatedBookings = useMemo(
    () => bookings.filter((b) => !b.scheduledAt && !b.preferredAt),
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
        <span className="hidden items-center gap-2 md:flex">
          {([
            ["PENDING", "Pending"],
            ["SCHEDULED", "Scheduled"],
            ["COMPLETED", "Completed"],
            ["CANCELLED", "Cancelled"],
          ] as const).map(([status, label]) => (
            <span key={status} className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-white/45">
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[status])} />
              {label}
            </span>
          ))}
        </span>



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
              <div
                key={key}
                className={cn(
                  "flex min-h-[104px] flex-col rounded-md border p-1.5 transition",
                  isSelected
                    ? "border-ocean bg-ocean/[0.05] dark:border-accent-400/60"
                    : hasBookings
                      ? "border-slate-200 dark:border-white/10"
                      : "border-transparent",
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px]",
                      isToday
                        ? "bg-ocean font-bold text-white"
                        : hasBookings
                          ? "font-semibold text-slate-800 dark:text-white/85"
                          : "text-slate-400 dark:text-white/30",
                    )}
                  >
                    {day}
                  </span>
                  {/* Filtering the list is a per-day action, so it lives on the
                      count — the rows themselves open a booking instead. */}
                  {hasBookings ? (
                    <button
                      type="button"
                      onClick={() => onSelectDay(isSelected ? null : key)}
                      title={isSelected ? "Show all days" : `Show only ${dayBookings.length} on this day`}
                      className={cn(
                        "rounded px-1 text-[10px] font-semibold transition",
                        isSelected
                          ? "bg-ocean text-white"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-white/45 dark:hover:bg-white/10",
                      )}
                    >
                      {dayBookings.length}
                    </button>
                  ) : null}
                </div>

                {/* Every booking on the day, not a summary of them. A busy day
                    scrolls inside its own cell rather than stretching the whole
                    row — the point is to read the actual names and times here,
                    without opening anything. */}
                {hasBookings ? (
                  <ul className="scrollbar-thin mt-1 max-h-[78px] space-y-0.5 overflow-y-auto pr-0.5">
                    {dayBookings.map((booking) => (
                      <li key={booking.id}>
                        <button
                          type="button"
                          onClick={() => onOpenBooking?.(booking.id)}
                          title={`${istTime(booking.scheduledAt ?? booking.preferredAt ?? "")} IST — ${booking.name}${booking.company ? ` (${booking.company})` : ""} · ${booking.status.toLowerCase()}`}
                          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left transition hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                        >
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[booking.status])} />
                          <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-600 dark:text-white/60">
                            {istTime(booking.scheduledAt ?? booking.preferredAt ?? "")}
                          </span>
                          <span className="truncate text-[10px] text-slate-700 dark:text-white/75">
                            {booking.name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bookings with no date at all. They cannot sit in the grid, but leaving
          them out entirely would make the calendar a partial view of the
          month — and these are the ones still waiting to be scheduled, so they
          are the most actionable rows on the page. */}
      {undatedBookings.length > 0 ? (
        <details className="group border-t border-slate-100 dark:border-white/[0.06]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-xs text-slate-600 dark:text-white/60">
            <ChevronRight className="h-3.5 w-3.5 text-slate-400 transition-transform group-open:rotate-90 dark:text-white/35" />
            <span className="font-medium">{undatedBookings.length} with no date yet</span>
            <span className="text-slate-400 dark:text-white/35">— nothing booked, waiting to be scheduled</span>
          </summary>
          <ul className="scrollbar-thin max-h-48 space-y-0.5 overflow-y-auto px-3 pb-3">
            {undatedBookings.map((booking) => (
              <li key={booking.id}>
                <button
                  type="button"
                  onClick={() => onOpenBooking?.(booking.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left transition hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                >
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_DOT[booking.status])} />
                  <span className="truncate text-xs text-slate-700 dark:text-white/75">{booking.name}</span>
                  {booking.company ? (
                    <span className="truncate text-[11px] text-slate-400 dark:text-white/35">{booking.company}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

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
            className="font-medium text-accent-600 hover:underline dark:text-accent-300"
          >
            Show all
          </button>
        </div>
      ) : null}
    </section>
  );
}

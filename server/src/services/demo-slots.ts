/**
 * Availability rules for demo bookings.
 *
 * Every slot is offered in India Standard Time regardless of where the person
 * booking happens to be: the demo is delivered by a team in India, so IST is
 * the only timezone in which "9 to 5, weekdays" is a meaningful statement.
 * Slots are computed here and handed to the client as absolute UTC instants
 * plus their IST wall-clock label, so the browser never has to reason about
 * the conversion (and can't get it wrong).
 *
 * IST is a fixed UTC+05:30 with no daylight saving — India has not observed DST
 * since 1945 — so a constant offset is exact here. That is why this file does
 * arithmetic instead of pulling in a timezone database; if the rules ever cover
 * a zone that observes DST, this must be rewritten against a real tz library.
 */

export const IST_OFFSET_MINUTES = 5 * 60 + 30;
export const IST_LABEL = "IST (GMT+5:30)";

/** First slot starts at 09:00 IST. */
export const BUSINESS_START_HOUR = 9;
/** Last slot ENDS at 17:00 IST, so the latest start is 16:30. */
export const BUSINESS_END_HOUR = 17;
export const SLOT_MINUTES = 30;

/** How far ahead bookings are offered. */
export const BOOKING_HORIZON_DAYS = 21;
/** No same-minute bookings: the team needs notice to prepare. */
export const MIN_LEAD_MINUTES = 120;

export type IstParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  /** 0 = Sunday … 6 = Saturday, in IST. */
  weekday: number;
};

/** Wall-clock components of an instant, as seen in India. */
export function toIstParts(instant: Date): IstParts {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    weekday: shifted.getUTCDay(),
  };
}

/** The instant at which the given IST wall-clock time occurs. */
export function fromIstParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - IST_OFFSET_MINUTES * 60_000);
}

/** Monday–Friday in IST. Saturday and Sunday are closed. */
export function isBusinessDay(weekday: number): boolean {
  return weekday >= 1 && weekday <= 5;
}

/** "2026-08-14" for the IST calendar day an instant falls on. */
export function istDateKey(instant: Date): string {
  const { year, month, day } = toIstParts(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** "09:30" — the IST wall-clock time of an instant. */
export function istTimeLabel(instant: Date): string {
  const { hour, minute } = toIstParts(instant);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Every slot start on one IST calendar day, business hours only. */
export function slotStartsForIstDay(year: number, month: number, day: number): Date[] {
  const probe = fromIstParts(year, month, day, 12);
  if (!isBusinessDay(toIstParts(probe).weekday)) return [];

  const starts: Date[] = [];
  const endMinutes = BUSINESS_END_HOUR * 60;
  for (let m = BUSINESS_START_HOUR * 60; m + SLOT_MINUTES <= endMinutes; m += SLOT_MINUTES) {
    starts.push(fromIstParts(year, month, day, Math.floor(m / 60), m % 60));
  }
  return starts;
}

export type SlotView = {
  /** Absolute instant, ISO-8601 UTC — what the client submits back. */
  startUtc: string;
  /** IST wall clock, e.g. "09:30". */
  istTime: string;
  /** IST wall clock of the slot end, e.g. "10:00". */
  istEndTime: string;
};

export type DayView = {
  /** IST calendar day, "2026-08-14". */
  date: string;
  /** "Thu" / "Thursday" style labels, computed IST-side for consistency. */
  weekdayShort: string;
  weekdayLong: string;
  /** "14 Aug 2026" */
  label: string;
  slots: SlotView[];
};

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Bookable days between now and the horizon.
 *
 * @param now       current instant (injected so this stays pure and testable)
 * @param takenUtc  ISO strings of slots already booked; those are omitted
 */
export function buildAvailability(now: Date, takenUtc: Iterable<string> = []): DayView[] {
  const taken = new Set<string>();
  for (const value of takenUtc) taken.add(new Date(value).toISOString());

  const earliest = new Date(now.getTime() + MIN_LEAD_MINUTES * 60_000);
  const days: DayView[] = [];

  // Walk IST calendar days from today, so "today" means today in India.
  const todayIst = toIstParts(now);
  for (let offset = 0; offset <= BOOKING_HORIZON_DAYS; offset += 1) {
    // Re-derive from a midday probe so month/year rollovers are handled by Date.
    const probe = fromIstParts(todayIst.year, todayIst.month, todayIst.day + offset, 12);
    const parts = toIstParts(probe);
    if (!isBusinessDay(parts.weekday)) continue;

    const slots = slotStartsForIstDay(parts.year, parts.month, parts.day)
      .filter((start) => start.getTime() >= earliest.getTime())
      .filter((start) => !taken.has(start.toISOString()))
      .map((start) => ({
        startUtc: start.toISOString(),
        istTime: istTimeLabel(start),
        istEndTime: istTimeLabel(new Date(start.getTime() + SLOT_MINUTES * 60_000)),
      }));

    if (slots.length === 0) continue;

    days.push({
      date: istDateKey(probe),
      weekdayShort: WEEKDAY_SHORT[parts.weekday],
      weekdayLong: WEEKDAY_LONG[parts.weekday],
      label: `${parts.day} ${MONTH_SHORT[parts.month - 1]} ${parts.year}`,
      slots,
    });
  }

  return days;
}

export type SlotRejection =
  | "NOT_ALIGNED"
  | "OUTSIDE_HOURS"
  | "WEEKEND"
  | "TOO_SOON"
  | "TOO_FAR";

/**
 * Server-side re-validation of a chosen slot.
 *
 * The client only ever renders slots this module produced, but the request is
 * just JSON over the wire — a stale tab, a retried submit, or someone posting
 * directly can all present a time that is no longer (or never was) bookable.
 * Availability is therefore decided here, never trusted from the payload.
 */
export function validateSlot(startUtc: Date, now: Date): SlotRejection | null {
  if (Number.isNaN(startUtc.getTime())) return "NOT_ALIGNED";

  const parts = toIstParts(startUtc);
  const minutesIntoDay = parts.hour * 60 + parts.minute;

  if (minutesIntoDay % SLOT_MINUTES !== 0) return "NOT_ALIGNED";
  if (startUtc.getTime() % (60_000) !== 0) return "NOT_ALIGNED";
  if (!isBusinessDay(parts.weekday)) return "WEEKEND";
  if (
    minutesIntoDay < BUSINESS_START_HOUR * 60 ||
    minutesIntoDay + SLOT_MINUTES > BUSINESS_END_HOUR * 60
  ) {
    return "OUTSIDE_HOURS";
  }
  if (startUtc.getTime() < now.getTime() + MIN_LEAD_MINUTES * 60_000) return "TOO_SOON";

  const horizon = new Date(now.getTime() + (BOOKING_HORIZON_DAYS + 1) * 86_400_000);
  if (startUtc.getTime() > horizon.getTime()) return "TOO_FAR";

  return null;
}

export function describeRejection(reason: SlotRejection): string {
  switch (reason) {
    case "WEEKEND":
      return "Demos run Monday to Friday only.";
    case "OUTSIDE_HOURS":
      return `Please pick a time between ${String(BUSINESS_START_HOUR).padStart(2, "0")}:00 and ${BUSINESS_END_HOUR}:00 ${IST_LABEL}.`;
    case "TOO_SOON":
      return "That slot is too close to now — please choose a later one.";
    case "TOO_FAR":
      return `Bookings open ${BOOKING_HORIZON_DAYS} days ahead. Please pick an earlier date.`;
    default:
      return "That time slot isn't valid. Please pick one from the list.";
  }
}

/** "Thu 14 Aug 2026, 09:30–10:00 IST (GMT+5:30)" — for emails and admin lists. */
export function formatSlotForHumans(startUtc: Date): string {
  const parts = toIstParts(startUtc);
  const end = new Date(startUtc.getTime() + SLOT_MINUTES * 60_000);
  return `${WEEKDAY_SHORT[parts.weekday]} ${parts.day} ${MONTH_SHORT[parts.month - 1]} ${parts.year}, ${istTimeLabel(startUtc)}–${istTimeLabel(end)} ${IST_LABEL}`;
}

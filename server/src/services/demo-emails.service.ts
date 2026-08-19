import { prisma, type DemoBooking } from "@marimail/db";
import { escapeHtml, renderEmailLayout, sendTransactionalEmail } from "@marimail/email";
import { formatSlotForHumans } from "./demo-slots.js";
import { WHATSAPP_DISPLAY, whatsappUrl } from "../lib/whatsapp.js";

/**
 * The three emails a demo attendee receives.
 *
 *   1. confirmation — the moment they book
 *   2. day-before   — ~24 hours before the slot
 *   3. hour-before  — ~1 hour before the slot
 *
 * Each is stamped on the booking when it goes out, so the sweep that runs every
 * few minutes cannot send the same message twice. The stamps are also the
 * record of what the attendee has actually been told, which matters when
 * someone asks why they were or weren't reminded.
 *
 * Every time is printed in IST. The slot was offered, agreed and stored in
 * India business hours, and a bare number in the attendee's own zone would be
 * the one thing capable of making them miss the call.
 */

export type DemoEmailKind = "confirmation" | "day" | "hour";

const APP_URL = () => process.env.APP_URL?.replace(/\/$/, "") ?? "https://mail.maribiz.ai";

type BookingLike = Pick<DemoBooking, "id" | "name" | "email" | "company" | "scheduledAt">;

function firstName(full: string): string {
  const first = full.trim().split(/\s+/)[0];
  return first || full.trim() || "there";
}

/**
 * Subject and body for one message.
 *
 * Kept in one function so the three read as a set: same voice, same slot line,
 * same way out if the time no longer works.
 */
function buildEmail(kind: DemoEmailKind, booking: BookingLike) {
  const slot = booking.scheduledAt ? formatSlotForHumans(booking.scheduledAt) : null;
  const hello = `Hi ${escapeHtml(firstName(booking.name))},`;
  const slotLine = slot
    ? `<strong>${escapeHtml(slot)}</strong>`
    : "the time we agreed";
  // Rescheduling is a conversation, not a form — WhatsApp is how this audience
  // actually replies, and the link carries the context so they don't retype it.
  const reschedule = whatsappUrl(
    `Hi, I have a MariMail demo booked${slot ? ` for ${slot}` : ""}. I need to reschedule.`,
  );

  if (kind === "confirmation") {
    return {
      subject: slot ? `Your MariMail demo is confirmed — ${slot}` : "Your MariMail demo is confirmed",
      preheader: slot ? `Confirmed for ${slot}.` : "Your demo is confirmed.",
      heading: "Your demo is confirmed",
      body: [
        hello,
        `Thanks for booking a MariMail demo. You're set for ${slotLine}.`,
        "We'll walk you through live vessel tracking, ETA-triggered campaigns and how MariMail finds the right people at each ship's owner and manager — and we'll leave time for your questions.",
        `We'll send a reminder the day before, and again an hour ahead. If the time stops working, message us on WhatsApp at ${escapeHtml(WHATSAPP_DISPLAY)} and we'll move it.`,
      ],
      cta: { label: "Message us on WhatsApp", url: reschedule },
      footnote: "You're receiving this because you booked a demo at marimail.",
    };
  }

  if (kind === "day") {
    return {
      subject: slot ? `Reminder: your MariMail demo is tomorrow — ${slot}` : "Reminder: your MariMail demo is tomorrow",
      preheader: slot ? `Tomorrow at ${slot}.` : "Your demo is tomorrow.",
      heading: "Your demo is tomorrow",
      body: [
        hello,
        `A quick reminder that your MariMail demo is tomorrow, ${slotLine}.`,
        "Nothing to prepare. If it helps, have a port or a vessel type in mind that matters to your business and we'll use it as the worked example.",
        `Need a different time? Message us on WhatsApp at ${escapeHtml(WHATSAPP_DISPLAY)}.`,
      ],
      cta: { label: "Message us on WhatsApp", url: reschedule },
      footnote: "You're receiving this because you booked a demo at marimail.",
    };
  }

  return {
    subject: slot ? `Starting soon: your MariMail demo at ${slot}` : "Your MariMail demo starts soon",
    preheader: "Your demo starts in about an hour.",
    heading: "Your demo starts in about an hour",
    body: [
      hello,
      `Your MariMail demo is coming up at ${slotLine}.`,
      "We'll call you on the number you gave us. If anything has changed, tell us now and we'll sort it out.",
      `WhatsApp: ${escapeHtml(WHATSAPP_DISPLAY)}`,
    ],
    cta: { label: "Message us on WhatsApp", url: reschedule },
    footnote: "You're receiving this because you booked a demo at marimail.",
  };
}

/** Column stamped for each kind — also what makes the send exactly-once. */
const STAMP: Record<DemoEmailKind, "confirmationSentAt" | "reminderDaySentAt" | "reminderHourSentAt"> = {
  confirmation: "confirmationSentAt",
  day: "reminderDaySentAt",
  hour: "reminderHourSentAt",
};

/**
 * Sends one message and stamps it.
 *
 * CLAIMS THE STAMP FIRST. Two sweeps overlapping — a slow send, a restart
 * mid-run — would otherwise both pass the "not sent yet" test and mail the
 * attendee twice. The conditional update means only one caller wins, and a
 * failed send clears the stamp so the next sweep retries rather than losing
 * the message.
 */
export async function sendDemoEmail(bookingId: string, kind: DemoEmailKind): Promise<boolean> {
  const column = STAMP[kind];
  const claimed = await prisma.demoBooking.updateMany({
    where: { id: bookingId, [column]: null },
    data: { [column]: new Date() },
  });
  if (claimed.count === 0) return false;

  const booking = await prisma.demoBooking.findUnique({
    where: { id: bookingId },
    select: { id: true, name: true, email: true, company: true, scheduledAt: true },
  });
  if (!booking) return false;

  const email = buildEmail(kind, booking);
  try {
    await sendTransactionalEmail({
      to: booking.email,
      subject: email.subject,
      html: renderEmailLayout({
        heading: email.heading,
        body: email.body,
        cta: email.cta,
        footnote: email.footnote,
        preheader: email.preheader,
      }),
      text: `${email.heading}\n\n${email.body.join("\n\n")}\n\n${APP_URL()}`,
    });
    return true;
  } catch (error) {
    // Hand it back so the next sweep tries again. An unsent reminder is a
    // missed demo; a stamp with no email behind it hides that permanently.
    await prisma.demoBooking
      .update({ where: { id: bookingId }, data: { [column]: null } })
      .catch(() => undefined);
    console.warn(
      `[demo] ${kind} email failed for ${bookingId}:`,
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Sends whatever reminders are now due.
 *
 * Run every few minutes. Windows rather than exact instants, because no sweep
 * lands precisely on a boundary:
 *
 *  - day  — a band from 20h to 24h out, NOT "any time under 24h". The email
 *           says "tomorrow", and a wider window made that a lie: a demo booked
 *           three hours ahead sat inside it, so the first sweep would tell
 *           someone their call was tomorrow when it was at teatime. A booking
 *           made later than the band simply skips this one; the hour reminder
 *           still covers it.
 *  - hour — inside the last hour, and not yet started.
 *
 * Cancelled and completed bookings are skipped: nobody wants a reminder for a
 * call that isn't happening.
 */
export async function sweepDemoReminders(): Promise<{ day: number; hour: number }> {
  const now = new Date();
  const sent = { day: 0, hour: 0 };

  const dueDay = await prisma.demoBooking.findMany({
    where: {
      status: { notIn: ["CANCELLED", "COMPLETED"] },
      reminderDaySentAt: null,
      scheduledAt: {
        gt: new Date(now.getTime() + 20 * HOUR_MS),
        lte: new Date(now.getTime() + 24 * HOUR_MS),
      },
    },
    select: { id: true },
    take: 200,
  });
  for (const booking of dueDay) {
    if (await sendDemoEmail(booking.id, "day")) sent.day += 1;
  }

  const dueHour = await prisma.demoBooking.findMany({
    where: {
      status: { notIn: ["CANCELLED", "COMPLETED"] },
      reminderHourSentAt: null,
      scheduledAt: { gt: now, lte: new Date(now.getTime() + HOUR_MS) },
    },
    select: { id: true },
    take: 200,
  });
  for (const booking of dueHour) {
    if (await sendDemoEmail(booking.id, "hour")) sent.hour += 1;
  }

  return sent;
}

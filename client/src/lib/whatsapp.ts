/**
 * MariMail's WhatsApp contact details, in one place.
 *
 * Number and message live here rather than at each call site so every WhatsApp
 * entry point opens the same conversation with the same opening line. A second
 * button written by hand later would drift — a different message, or worse, a
 * stale number — and the visitor would be the one to discover it.
 */

/** Digits only, country code first — the format wa.me requires. */
export const WHATSAPP_NUMBER = "917753038331";

/** Human-readable, for display next to the button. */
export const WHATSAPP_DISPLAY = "+91 77530 38331";

/** The opening line every WhatsApp link pre-fills. */
export const WHATSAPP_MESSAGE =
  "Hi, I'm interested in MariMail. Can you share more details and a demo?";

/**
 * A wa.me link with the message pre-filled.
 *
 * `wa.me` rather than `api.whatsapp.com`: it resolves to the installed app on
 * mobile and to WhatsApp Web on desktop, so one URL works everywhere.
 */
export function whatsappUrl(message: string = WHATSAPP_MESSAGE): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

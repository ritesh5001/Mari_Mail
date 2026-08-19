/**
 * MariMail's WhatsApp contact details for server-sent email.
 *
 * Mirrors `client/src/lib/whatsapp.ts`. The two stacks cannot share a module
 * without pulling this into a package, and one constant duplicated with a
 * pointer is a smaller cost than a package existing only to hold a phone
 * number — but they must be changed together.
 */

export const WHATSAPP_NUMBER = "917753038331";
export const WHATSAPP_DISPLAY = "+91 77530 38331";

export const WHATSAPP_MESSAGE =
  "Hi, I'm interested in MariMail. Can you share more details and a demo?";

export function whatsappUrl(message: string = WHATSAPP_MESSAGE): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

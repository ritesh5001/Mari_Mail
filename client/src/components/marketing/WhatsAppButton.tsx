import { WHATSAPP_DISPLAY, whatsappUrl } from "@/lib/whatsapp";

/** WhatsApp's brand glyph. Inline SVG so it scales and themes cleanly. */
function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 016.988 2.898 9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

/**
 * Floating "chat on WhatsApp" button for the public site.
 *
 * WhatsApp is how most of this audience actually replies, so it sits fixed
 * above the fold on every marketing page rather than only in the footer. The
 * label is visible on desktop and collapses to the glyph on small screens,
 * where the thumb reaches it but the width does not allow prose.
 *
 * A plain link, not a script widget: it costs no JavaScript, works with the
 * page still loading, and cannot break the page if WhatsApp is unreachable.
 */
export function WhatsAppButton() {
  return (
    <a
      href={whatsappUrl()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Chat with MariMail on WhatsApp at ${WHATSAPP_DISPLAY}`}
      title={`WhatsApp ${WHATSAPP_DISPLAY}`}
      className="group fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-black/20 transition hover:bg-[#1ebe5b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366]/50 focus-visible:ring-offset-2"
    >
      <WhatsAppGlyph className="h-5 w-5 shrink-0" />
      <span className="hidden sm:inline">Chat on WhatsApp</span>
    </a>
  );
}

/**
 * Header-chrome variant, for the signed-in dashboard.
 *
 * Not the floating button the marketing pages use: the dashboard's bottom-right
 * corner is already taken twice over — every toast in the app renders at
 * `fixed bottom-5 right-5`, and the Port Radar table pins its pagination to
 * `sticky bottom-0`. A floating button there would cover the "Next" control and
 * fight each toast for the same 200 pixels. Sitting in the header instead, it
 * is visible on every dashboard page and collides with nothing.
 *
 * Same number, same pre-filled message as everywhere else — both come from
 * `@/lib/whatsapp`.
 */
export function WhatsAppHeaderButton() {
  return (
    <a
      href={whatsappUrl()}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Chat with MariMail on WhatsApp at ${WHATSAPP_DISPLAY}`}
      title={`WhatsApp ${WHATSAPP_DISPLAY}`}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-[#25D366] shadow-sm transition-colors hover:border-[#25D366]/40 hover:bg-[#25D366]/10 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-[#25D366]/15"
    >
      <WhatsAppGlyph className="h-4 w-4" />
    </a>
  );
}

/** Inline variant for footers and CTA sections. */
export function WhatsAppLink({ className }: { className?: string }) {
  return (
    <a
      href={whatsappUrl()}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        "inline-flex items-center gap-2 text-sm font-semibold text-[#25D366] transition hover:underline"
      }
    >
      <WhatsAppGlyph className="h-4 w-4 shrink-0" />
      WhatsApp {WHATSAPP_DISPLAY}
    </a>
  );
}

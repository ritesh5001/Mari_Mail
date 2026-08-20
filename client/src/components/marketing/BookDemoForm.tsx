"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import PhoneInput, { type Country } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { apiUrl } from "@/lib/client-api";
import { DemoSlotPicker } from "@/components/marketing/DemoSlotPicker";

const inputCls =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-accent-400 focus:ring-4 focus:ring-accent-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:shadow-none dark:placeholder:text-white/30 dark:focus:border-accent-400/60 dark:focus:bg-white/[0.06] dark:focus:ring-0";
const labelCls = "block text-xs font-semibold text-slate-600 dark:text-white/70";

/** Red asterisk marking a required field. */
function Req() {
  return <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>;
}

/**
 * Country the WhatsApp field starts on.
 *
 * Fixed to India rather than sniffed from the visitor's locale. The previous
 * version guarded on `typeof navigator !== "undefined"` to mean "we're in the
 * browser", but Node has shipped a global `navigator` since v21 and reports
 * `language: "en-US"` — so server rendering silently resolved to the SERVER's
 * locale and every visitor got a US flag with a +1 prefix, while the "IN"
 * fallback underneath it became unreachable. It also made the server and client
 * disagree, which is its own class of hydration bug.
 *
 * A constant is right here regardless: MariMail sells from India and the field
 * is a WhatsApp number, so India is the useful default. Visitors elsewhere
 * still pick their own country from the selector.
 */
const DEFAULT_PHONE_COUNTRY: Country = "IN";

export function BookDemoForm({ successMessage }: { successMessage: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [slotLabel, setSlotLabel] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | undefined>(undefined);
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // The WhatsApp number is a controlled PhoneInput (not a native <input>), so
    // the browser's `required` validation doesn't cover it — enforce it here.
    if (!phone || phone.trim().length < 6) {
      setError("Please enter your WhatsApp number.");
      return;
    }

    // Same story for the slot picker: it's buttons, not a form control.
    if (!scheduledAt) {
      setError("Please choose a date and time for your demo.");
      return;
    }

    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;

    const payload = {
      name: String(form.get("name") ?? "").trim(),
      email: String(form.get("email") ?? "").trim(),
      company: String(form.get("company") ?? "").trim(),
      role: String(form.get("role") ?? "").trim(),
      phone: (phone ?? "").trim(),
      message: String(form.get("message") ?? "").trim(),
      scheduledAt,
      timezone: tz,
      source: typeof window !== "undefined" ? window.location.pathname : "/book-demo",
    };

    try {
      const response = await fetch(`${apiUrl}/api/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => null)) as
        | { data?: { slotLabel?: string | null }; error?: { code?: string; message?: string } }
        | null;

      if (!response.ok) {
        setError(body?.error?.message ?? "Couldn't submit your request. Please try again.");
        // Someone else took the slot in the meantime, or it expired while the
        // form sat open. Clear it so the picker (which refetches) can't
        // re-submit the same dead time.
        if (body?.error?.code === "SLOT_TAKEN" || body?.error?.code === "SLOT_INVALID") {
          setScheduledAt(null);
        }
        setPending(false);
        return;
      }

      setSlotLabel(body?.data?.slotLabel ?? null);
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <div className="py-10 text-center">
        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Demo booked</h2>
        {slotLabel ? (
          <p className="mx-auto mt-3 max-w-sm rounded-lg border border-accent-200 bg-accent-50 px-3 py-2 text-sm font-semibold text-accent-900 dark:border-accent-500/30 dark:bg-accent-500/10 dark:text-accent-200">
            {slotLabel}
          </p>
        ) : null}
        <p className="mt-3 text-sm text-slate-600 dark:text-white/65">{successMessage}</p>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <h2 className="text-base font-semibold text-slate-950 dark:text-white">Tell us about your team</h2>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="name" className={labelCls}>
            Full name<Req />
          </label>
          <input id="name" name="name" type="text" autoComplete="name" required className={inputCls} placeholder="Alex Chen" />
        </div>
        <div>
          <label htmlFor="company" className={labelCls}>
            Company<Req />
          </label>
          <input id="company" name="company" type="text" autoComplete="organization" required className={inputCls} placeholder="Acme Shipping" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="email" className={labelCls}>
            Work email<Req />
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className={inputCls} placeholder="alex@acme.com" />
        </div>
        <div>
          <label htmlFor="phone" className={labelCls}>
            Whatsapp Number<Req />
          </label>
          <PhoneInput
            id="phone"
            international
            defaultCountry={DEFAULT_PHONE_COUNTRY}
            value={phone}
            onChange={setPhone}
            countryCallingCodeEditable={false}
            autoComplete="tel"
            className="marimail-phone mt-1.5"
            numberInputProps={{ className: `${inputCls} mt-0` }}
          />
        </div>
      </div>

      <div>
        <label htmlFor="role" className={labelCls}>
          Role<Req />
        </label>
        <input id="role" name="role" type="text" required className={inputCls} placeholder="Fleet Manager" />
      </div>

      <div className="border-t border-slate-100 pt-4 dark:border-white/10">
        <p className={labelCls}>
          Choose your demo slot<Req />
        </p>
        <div className="mt-2">
          <DemoSlotPicker value={scheduledAt} onChange={setScheduledAt} />
        </div>
      </div>

      <div>
        <label htmlFor="message" className={labelCls}>
          Your Requirements? (optional)
        </label>
        <textarea
          id="message"
          name="message"
          rows={4}
          className={inputCls}
          placeholder="We charter dry bulk and need better ETA visibility for Indian ports…"
        />
      </div>

      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-accent-700 to-accent-500 text-sm font-semibold text-white shadow-[0_16px_42px_rgba(79,109,255,0.24)] transition hover:from-accent-600 hover:to-accent-400 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#F8FAFC] dark:bg-none dark:text-black dark:shadow-none dark:hover:bg-[#EDEDF0]"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Confirming…
          </>
        ) : (
          "Confirm demo booking"
        )}
      </button>
      <p className="text-center text-[11px] text-slate-500 dark:text-white/40">By submitting you agree to our terms and privacy policy.</p>
    </form>
  );
}

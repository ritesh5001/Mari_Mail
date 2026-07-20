"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import PhoneInput, { type Country } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { apiUrl } from "@/lib/client-api";

const inputCls =
  "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:shadow-none dark:placeholder:text-white/30 dark:focus:border-accent-400/60 dark:focus:bg-white/[0.06] dark:focus:ring-0";
const labelCls = "block text-xs font-semibold text-slate-600 dark:text-white/70";

function detectDefaultCountry(): Country {
  try {
    const lang = typeof navigator !== "undefined" ? navigator.language : undefined;
    if (lang) {
      const region = new Intl.Locale(lang).maximize().region;
      if (region) return region as Country;
    }
  } catch {
    // fall through to default
  }
  return "IN";
}

export function BookDemoForm({ successMessage }: { successMessage: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [phone, setPhone] = useState<string | undefined>(undefined);
  const [defaultCountry] = useState<Country>(() => detectDefaultCountry());

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      timezone: tz,
      source: typeof window !== "undefined" ? window.location.pathname : "/book-demo",
    };

    try {
      const response = await fetch(`${apiUrl}/api/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        setError(body?.error?.message ?? "Couldn't submit your request. Please try again.");
        setPending(false);
        return;
      }

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
        <h2 className="text-lg font-semibold text-slate-950 dark:text-white">Request received</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-white/65">{successMessage}</p>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <h2 className="text-base font-semibold text-slate-950 dark:text-white">Tell us about your team</h2>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="name" className={labelCls}>
            Full name
          </label>
          <input id="name" name="name" type="text" autoComplete="name" required className={inputCls} placeholder="Alex Chen" />
        </div>
        <div>
          <label htmlFor="company" className={labelCls}>
            Company
          </label>
          <input id="company" name="company" type="text" autoComplete="organization" className={inputCls} placeholder="Acme Shipping" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="email" className={labelCls}>
            Work email
          </label>
          <input id="email" name="email" type="email" autoComplete="email" required className={inputCls} placeholder="alex@acme.com" />
        </div>
        <div>
          <label htmlFor="phone" className={labelCls}>
            Whatsapp Number (optional)
          </label>
          <PhoneInput
            id="phone"
            international
            defaultCountry={defaultCountry}
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
          Role
        </label>
        <input id="role" name="role" type="text" className={inputCls} placeholder="Fleet Manager" />
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
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-sky-700 to-blue-700 text-sm font-semibold text-white shadow-[0_16px_42px_rgba(2, 132, 199,0.24)] transition hover:from-sky-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-[#F8FAFC] dark:bg-none dark:text-black dark:shadow-none dark:hover:bg-[#EDEDF0]"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Submitting…
          </>
        ) : (
          "Request demo"
        )}
      </button>
      <p className="text-center text-[11px] text-slate-500 dark:text-white/40">By submitting you agree to our terms and privacy policy.</p>
    </form>
  );
}

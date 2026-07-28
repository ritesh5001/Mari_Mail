"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { PasswordStrength } from "./PasswordStrength";
import { apiUrl } from "@/lib/client-api";

type RegisterDefaults = {
  name: string;
  email: string;
  workspaceName: string;
  termsAccepted: boolean;
  timezone: string;
  targetPortCountry: string;
  plan?: string;
};

/** Plans offered at signup — each grants a 14-day free trial + N countries. */
type PlanKey = "STARTER" | "PRO" | "FLEET";
const PLANS: { key: PlanKey; name: string; price: string; countries: number; blurb: string }[] = [
  { key: "STARTER", name: "Starter", price: "$25/mo", countries: 1, blurb: "1 country · solo operator" },
  { key: "PRO", name: "Pro", price: "$45/mo", countries: 2, blurb: "2 countries · growing desk" },
  { key: "FLEET", name: "Fleet", price: "$85/mo", countries: 4, blurb: "4 countries · brokerage" },
];
const PLAN_COUNTRIES: Record<PlanKey, number> = { STARTER: 1, PRO: 2, FLEET: 4 };

/**
 * Curated UTC-offset list surfaced in the timezone picker. We ship offsets
 * (per user request) instead of full IANA identifiers, and translate them
 * to the fixed `Etc/GMT±N` zone the server understands on submit. The Etc
 * zones are UTC-only (no DST) — an acceptable tradeoff for a one-time
 * onboarding pick; users who need DST switch it later from workspace
 * settings.
 *
 * Sign flip note: `Etc/GMT+X` is actually UTC-X hours, not UTC+X — that's
 * how the POSIX-derived Etc zones are historically defined. We invert the
 * sign here so `label:"+05:30"` becomes `iana:"Etc/GMT-5:30"` which then
 * resolves to the correct wall-clock offset. India (+05:30) is the only
 * common half-hour offset in the list; it also has a proper IANA fallback
 * (Asia/Kolkata) since Etc doesn't do fractional hours.
 */
type OffsetOption = { label: string; iana: string; minutes: number };
const OFFSET_OPTIONS: OffsetOption[] = [
  { label: "UTC−12:00", iana: "Etc/GMT+12", minutes: -12 * 60 },
  { label: "UTC−11:00", iana: "Etc/GMT+11", minutes: -11 * 60 },
  { label: "UTC−10:00", iana: "Etc/GMT+10", minutes: -10 * 60 },
  { label: "UTC−09:00", iana: "Etc/GMT+9", minutes: -9 * 60 },
  { label: "UTC−08:00", iana: "Etc/GMT+8", minutes: -8 * 60 },
  { label: "UTC−07:00", iana: "Etc/GMT+7", minutes: -7 * 60 },
  { label: "UTC−06:00", iana: "Etc/GMT+6", minutes: -6 * 60 },
  { label: "UTC−05:00", iana: "Etc/GMT+5", minutes: -5 * 60 },
  { label: "UTC−04:00", iana: "Etc/GMT+4", minutes: -4 * 60 },
  { label: "UTC−03:00", iana: "Etc/GMT+3", minutes: -3 * 60 },
  { label: "UTC−02:00", iana: "Etc/GMT+2", minutes: -2 * 60 },
  { label: "UTC−01:00", iana: "Etc/GMT+1", minutes: -60 },
  { label: "UTC±00:00", iana: "Etc/UTC", minutes: 0 },
  { label: "UTC+01:00", iana: "Etc/GMT-1", minutes: 60 },
  { label: "UTC+02:00", iana: "Etc/GMT-2", minutes: 2 * 60 },
  { label: "UTC+03:00", iana: "Etc/GMT-3", minutes: 3 * 60 },
  { label: "UTC+04:00", iana: "Etc/GMT-4", minutes: 4 * 60 },
  { label: "UTC+05:00", iana: "Etc/GMT-5", minutes: 5 * 60 },
  { label: "UTC+05:30", iana: "Asia/Kolkata", minutes: 5 * 60 + 30 },
  { label: "UTC+06:00", iana: "Etc/GMT-6", minutes: 6 * 60 },
  { label: "UTC+07:00", iana: "Etc/GMT-7", minutes: 7 * 60 },
  { label: "UTC+08:00", iana: "Etc/GMT-8", minutes: 8 * 60 },
  { label: "UTC+09:00", iana: "Etc/GMT-9", minutes: 9 * 60 },
  { label: "UTC+10:00", iana: "Etc/GMT-10", minutes: 10 * 60 },
  { label: "UTC+11:00", iana: "Etc/GMT-11", minutes: 11 * 60 },
  { label: "UTC+12:00", iana: "Etc/GMT-12", minutes: 12 * 60 },
];

/** Best-effort browser-timezone → offset lookup for the default selection. */
function detectDefaultOffset(): OffsetOption {
  if (typeof Intl === "undefined") return OFFSET_OPTIONS[12]; // UTC±00:00
  try {
    const localMinutes = -new Date().getTimezoneOffset(); // JS is inverted vs. UTC
    return (
      OFFSET_OPTIONS.find((o) => o.minutes === localMinutes) ?? OFFSET_OPTIONS[12]
    );
  } catch {
    return OFFSET_OPTIONS[12];
  }
}

export function RegisterForm({
  defaults,
  serverError,
}: {
  defaults: RegisterDefaults;
  serverError: string | null;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(serverError);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [countries, setCountries] = useState<Array<{ country: string; countryName: string }>>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);

  // Preselect the browser's UTC offset unless a redirected retry supplied one.
  const initialOffset = useMemo(() => {
    if (defaults.timezone) {
      const match = OFFSET_OPTIONS.find((o) => o.iana === defaults.timezone);
      if (match) return match;
    }
    return detectDefaultOffset();
  }, [defaults.timezone]);
  const [offsetIana, setOffsetIana] = useState<string>(initialOffset.iana);
  const [country, setCountry] = useState<string>(defaults.targetPortCountry);

  // Plan selection → country allowance. Default to the plan from a retry, else
  // Pro (the "most popular" tier).
  const initialPlan = (["STARTER", "PRO", "FLEET"] as const).includes(defaults.plan as PlanKey)
    ? (defaults.plan as PlanKey)
    : "PRO";
  const [plan, setPlan] = useState<PlanKey>(initialPlan);
  const countryCap = PLAN_COUNTRIES[plan];
  // The set of countries the user wants to track (up to countryCap).
  const [selectedCountries, setSelectedCountries] = useState<string[]>(
    defaults.targetPortCountry ? [defaults.targetPortCountry] : [],
  );

  // When the plan shrinks the allowance, trim the selection to fit.
  useEffect(() => {
    setSelectedCountries((prev) => prev.slice(0, countryCap));
  }, [countryCap]);

  function toggleCountry(code: string) {
    setSelectedCountries((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= countryCap) return prev; // at cap — ignore
      return [...prev, code];
    });
  }

  // Public country list — no session needed here, it's the same reference
  // data the authed picker uses.
  useEffect(() => {
    let cancelled = false;
    fetch(`${apiUrl}/workspaces/port-countries/public`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((payload: { data?: Array<{ country: string; countryName: string }> } | null) => {
        if (cancelled) return;
        setCountries(payload?.data ?? []);
        setCountriesLoading(false);
      })
      .catch(() => {
        if (!cancelled) setCountriesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch(`${apiUrl}/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        password,
        workspaceName: String(form.get("workspaceName") ?? ""),
        termsAccepted: form.get("termsAccepted") === "on",
        timezone: offsetIana,
        // Keep the single targetPortCountry (primary = first selected) so
        // existing workspace logic still works, and send the full plan +
        // multi-country selection for access provisioning.
        targetPortCountry: selectedCountries[0] ?? country,
        plan,
        countries: selectedCountries,
      }),
    });

    setPending(false);

    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      setError(payload.error?.message ?? "Registration failed. Please try again.");
      return;
    }

    router.push("/login?registered=1");
  }

  return (
    <form className="space-y-4" method="post" action={`${apiUrl}/auth/register`} onSubmit={onSubmit}>
      <div className="grid grid-cols-2 gap-3">
        <FloatingField id="name" label="Full name" required>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            defaultValue={defaults.name}
            placeholder="Alex Chen"
            className={FLOATING_INPUT_CLS}
            required
          />
        </FloatingField>
        <FloatingField id="workspaceName" label="Workspace name" required>
          <input
            id="workspaceName"
            name="workspaceName"
            type="text"
            defaultValue={defaults.workspaceName}
            placeholder="Acme Shipping"
            className={FLOATING_INPUT_CLS}
            required
          />
        </FloatingField>
      </div>

      <FloatingField id="email" label="Work email" required>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaults.email}
          placeholder="you@company.com"
          className={FLOATING_INPUT_CLS}
          required
        />
      </FloatingField>

      {/* Plan selection — grants a 14-day free trial + N countries. */}
      <div>
        <p className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-white/80">
          Choose your plan
          <span className="ml-1.5 font-normal text-slate-400 dark:text-white/40">· 14-day free trial</span>
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PLANS.map((p) => {
            const active = plan === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPlan(p.key)}
                className={`rounded-lg border p-2.5 text-left transition-all ${
                  active
                    ? "border-accent-500 bg-accent-500/[0.06] ring-1 ring-accent-500 dark:border-accent-400 dark:ring-accent-400/60"
                    : "border-slate-200 bg-white hover:border-accent-300 dark:border-white/10 dark:bg-white/[0.04]"
                }`}
              >
                <span className="block text-sm font-bold text-slate-900 dark:text-white">{p.name}</span>
                <span className="block text-xs font-semibold text-accent-600 dark:text-accent-300">{p.price}</span>
                <span className="mt-0.5 block text-[11px] leading-tight text-slate-500 dark:text-white/45">{p.blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Country access — pick up to the plan's allowance. */}
      <div>
        <p className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-white/80">
          Countries to track
          <span className="ml-1.5 font-normal text-slate-400 dark:text-white/40">
            · {selectedCountries.length}/{countryCap} selected
          </span>
        </p>
        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/[0.04]">
          {countriesLoading ? (
            <p className="px-2 py-3 text-sm text-slate-400 dark:text-white/40">Loading countries…</p>
          ) : (
            countries.map((option) => {
              const checked = selectedCountries.includes(option.country);
              const atCap = !checked && selectedCountries.length >= countryCap;
              return (
                <label
                  key={option.country}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                    atCap
                      ? "cursor-not-allowed opacity-40"
                      : "hover:bg-slate-50 dark:hover:bg-white/[0.05]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={atCap}
                    onChange={() => toggleCountry(option.country)}
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-accent-500 dark:border-white/20"
                  />
                  <span className="text-slate-700 dark:text-white/75">
                    {option.countryName} <span className="text-slate-400 dark:text-white/40">({option.country})</span>
                  </span>
                </label>
              );
            })
          )}
        </div>
        {selectedCountries.length >= countryCap && (
          <p className="mt-1 text-[11px] text-slate-400 dark:text-white/40">
            {plan} plan includes {countryCap} {countryCap === 1 ? "country" : "countries"}. Upgrade for more.
          </p>
        )}
      </div>

      <FloatingField id="timezone" label="Timezone (UTC offset)" required>
        <select
          id="timezone"
          value={offsetIana}
          onChange={(e) => setOffsetIana(e.target.value)}
          required
          className={`${FLOATING_INPUT_CLS} appearance-none`}
        >
          {OFFSET_OPTIONS.map((option) => (
            <option key={option.iana} value={option.iana}>
              {option.label}
            </option>
          ))}
        </select>
      </FloatingField>

      <FloatingField id="password" label="Password" required>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••••"
            className={`${FLOATING_INPUT_CLS} pr-10`}
            minLength={10}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 dark:text-white/40 dark:hover:text-white/70"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </FloatingField>
      <PasswordStrength password={password} />

      <label className="flex items-start gap-2.5 cursor-pointer select-none">
        <input
          name="termsAccepted"
          type="checkbox"
          defaultChecked={defaults.termsAccepted}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 accent-accent-500 dark:border-white/20"
          required
        />
        <span className="text-xs leading-5 text-slate-500 dark:text-white/50">
          I agree to use MariMail for permission-based business outreach only.
        </span>
      </label>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending || selectedCountries.length === 0}
        className="w-full rounded-lg bg-[#4F6DFF] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_28px_rgba(14, 165, 233,0.4)] transition-all hover:-translate-y-0.5 hover:bg-[#3B4FE6] hover:shadow-[0_12px_36px_rgba(14, 165, 233,0.5)] disabled:cursor-not-allowed disabled:opacity-60 disabled:transform-none"
      >
        {pending ? "Creating workspace…" : "Create your workspace"}
      </button>
    </form>
  );
}

/**
 * Floating-label form-control wrapper. The label sits inside the rounded
 * border at the top-left (with a padded background chip that clips the
 * border), and the input/select is rendered as a child. Focus-within style
 * on the wrapper lifts the border color for the whole tile including the
 * label chip, which is what makes the effect read as "active" instead of
 * just a stylized label.
 */
function FloatingField({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative rounded-lg border border-slate-200 bg-white transition-colors focus-within:border-accent-500 dark:border-white/10 dark:bg-white/[0.06] dark:focus-within:border-accent-400">
      <label
        htmlFor={id}
        className="absolute -top-2 left-3 z-10 bg-white px-1 text-[11px] font-medium text-slate-500 group-focus-within:text-accent-500 dark:bg-[#0B0B0E] dark:text-white/60 dark:group-focus-within:text-accent-300"
      >
        {label}
        {required ? <span className="ml-0.5 text-accent-500">*</span> : null}
      </label>
      {children}
    </div>
  );
}

/**
 * Shared inner-input class used inside every FloatingField. The wrapper
 * paints the border; the input is fully transparent so focus/hover state
 * flows from the parent's `focus-within:` classes, avoiding the double-ring
 * effect a native focus ring would cause on top of a bordered wrapper.
 */
const FLOATING_INPUT_CLS =
  "block w-full rounded-lg border-0 bg-transparent px-3.5 py-3 text-sm text-slate-950 placeholder:text-slate-400 outline-none focus:ring-0 dark:text-white dark:placeholder:text-white/30";

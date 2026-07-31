"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, Search, X } from "lucide-react";
import { PasswordStrength } from "./PasswordStrength";
import {
  PLANS as SHARED_PLANS,
  SIGNUP_PLANS,
  SIGNUP_PLAN_TO_BILLING,
  TRIAL_CREDITS,
  TRIAL_DAYS,
  planPriceLabel,
  type SignupPlanKey,
} from "@marimail/utils/plans";
import { PASSWORD_MIN_LENGTH, evaluatePassword } from "@marimail/utils/password-policy";
import { apiUrl } from "@/lib/client-api";
import { CaptchaField, resetCaptcha } from "./CaptchaField";
import { MotionButton } from "@/components/ui/motion-button";

export type RegisterDefaults = {
  name: string;
  email: string;
  workspaceName: string;
  termsAccepted: boolean;
  timezone: string;
  targetPortCountry: string;
  plan?: string;
};

/**
 * Plans offered at signup. Every plan starts with the same trial (500 tokens
 * over 14 days); the plan sets the country allowance and the price after it.
 *
 * Prices, country allowances and the FLEET→BUSINESS mapping all come from the
 * shared catalog. They used to be a hand-kept copy that agreed with nothing
 * else in the codebase, which stopped being cosmetic the moment a gateway
 * started charging cards.
 */
type PlanKey = SignupPlanKey;
const BLURBS: Record<PlanKey, string> = {
  STARTER: "solo operator",
  PRO: "growing desk",
  FLEET: "brokerage",
};
const PLANS: { key: PlanKey; name: string; price: string; countries: number; blurb: string }[] =
  SIGNUP_PLANS.map((key) => {
    const def = SHARED_PLANS[SIGNUP_PLAN_TO_BILLING[key]];
    return {
      key,
      name: def.label,
      price: planPriceLabel(def.key),
      countries: def.countryLimit,
      blurb: `${def.countryLimit} ${def.countryLimit === 1 ? "country" : "countries"} · ${BLURBS[key]}`,
    };
  });
const PLAN_COUNTRIES: Record<PlanKey, number> = Object.fromEntries(
  SIGNUP_PLANS.map((key) => [key, SHARED_PLANS[SIGNUP_PLAN_TO_BILLING[key]].countryLimit]),
) as Record<PlanKey, number>;

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
  onRegistered,
}: {
  defaults: RegisterDefaults;
  serverError: string | null;
  /** Called once the account exists, with the address and the server's policy. */
  onRegistered: (email: string, verificationRequired: boolean) => void;
}) {
  // Two-step flow: account details, then workspace setup. Splitting it keeps
  // the first screen to three familiar fields instead of nine mixed ones.
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(defaults.name);
  const [email, setEmail] = useState(defaults.email);
  const [workspaceName, setWorkspaceName] = useState(defaults.workspaceName);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(serverError);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // null until the challenge is solved. The widget renders nothing (and this
  // stays null) when CAPTCHA is disabled server-side, so signup is unaffected.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  // The country list is ~209 entries; without a filter, finding one means
  // scrolling a tiny box past a hundred-odd options.
  const [countrySearch, setCountrySearch] = useState("");
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
  const initialPlan = SIGNUP_PLANS.includes(defaults.plan as PlanKey)
    ? (defaults.plan as PlanKey)
    : "PRO";
  const [plan, setPlan] = useState<PlanKey>(initialPlan);
  const countryCap = PLAN_COUNTRIES[plan];
  // The set of countries the user wants to track (up to countryCap).
  const [selectedCountries, setSelectedCountries] = useState<string[]>(
    defaults.targetPortCountry ? [defaults.targetPortCountry] : [],
  );

  // Filter by name or ISO code so "NL" and "Netherlands" both work.
  const visibleCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter(
      (c) => c.countryName.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
    );
  }, [countries, countrySearch]);

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

  // Step 1 must be complete before we let anyone move on — otherwise they fill
  // in a whole workspace and only then learn their email was malformed.
  const step1Valid =
    name.trim().length >= 2 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) &&
    evaluatePassword(password).valid;

  function goToStep2() {
    if (!step1Valid) {
      setError("Complete your details to continue.");
      return;
    }
    setError(null);
    setStep(2);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Pressing Enter on step 1 should advance, not submit a half-filled form.
    if (step === 1) {
      goToStep2();
      return;
    }
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch(`${apiUrl}/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        email,
        password,
        workspaceName,
        termsAccepted: form.get("termsAccepted") === "on",
        captchaToken,
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
      // Solve tokens are single-use — clear and re-render so a retry gets a
      // fresh one instead of replaying a spent token.
      setCaptchaToken(null);
      resetCaptcha();
      return;
    }

    // Show the "confirm your email" screen in place of the form rather than
    // redirecting to /login, whose banner told people to sign in — which the
    // EMAIL_NOT_VERIFIED guard then refuses. The address stays in component
    // state instead of a query param so it never lands in browser history,
    // referrer headers or server logs.
    const payload = (await response.json().catch(() => null)) as {
      data?: { verificationRequired?: boolean };
    } | null;
    onRegistered(email, payload?.data?.verificationRequired ?? false);
  }

  return (
    <form className="space-y-4" method="post" action={`${apiUrl}/auth/register`} onSubmit={onSubmit}>
      {/* Progress: shows how much is left, which is the main thing a split
          form has to communicate. */}
      <div className="flex items-center gap-3" aria-label={`Step ${step} of 2`}>
        {[1, 2].map((n) => (
          <div key={n} className="flex flex-1 items-center gap-2">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors ${
                step > n
                  ? "bg-emerald-500 text-[#ffffff]"
                  : step === n
                    ? "bg-accent-500 text-[#ffffff]"
                    : "bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-white/40"
              }`}
            >
              {step > n ? <Check className="h-3 w-3" strokeWidth={3} /> : n}
            </span>
            <span
              className={`text-xs font-medium ${
                step >= n ? "text-slate-700 dark:text-white/80" : "text-slate-400 dark:text-white/35"
              }`}
            >
              {n === 1 ? "Your details" : "Workspace"}
            </span>
            {n === 1 ? (
              <span
                className={`h-px flex-1 transition-colors ${
                  step > 1 ? "bg-emerald-500" : "bg-slate-200 dark:bg-white/10"
                }`}
              />
            ) : null}
          </div>
        ))}
      </div>

      {step === 1 ? (
      <>
      <FloatingField id="name" label="Full name" required>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Chen"
            className={FLOATING_INPUT_CLS}
            required
          />
        </FloatingField>

      <FloatingField id="email" label="Work email" required>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className={FLOATING_INPUT_CLS}
          required
        />
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
            minLength={PASSWORD_MIN_LENGTH}
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

      {/* Advance rather than submit; the real submit lives on step 2. */}
      <MotionButton
        type="button"
        size="md"
        onClick={goToStep2}
        disabled={!step1Valid}
        className="w-full"
        label="Continue"
      />

      </>
      ) : (
      <>
        <FloatingField id="workspaceName" label="Workspace name" required>
          <input
            id="workspaceName"
            name="workspaceName"
            type="text"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            placeholder="Acme Shipping"
            className={FLOATING_INPUT_CLS}
            required
          />
        </FloatingField>

      {/* Plan selection — sets the country allowance and what the workspace is
          charged once the trial's tokens or days run out. */}
      <div>
        <p className="mb-2 text-[13px] font-semibold text-slate-700 dark:text-white/80">
          Choose your plan
          <span className="ml-1.5 font-normal text-slate-400 dark:text-white/40">
            · {TRIAL_CREDITS.toLocaleString("en-US")} trial tokens for {TRIAL_DAYS} days
          </span>
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {PLANS.map((p) => {
            const active = plan === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPlan(p.key)}
                aria-pressed={active}
                className={`relative rounded-lg border p-3 text-left transition-all ${
                  active
                    ? "border-accent-500 bg-accent-500/[0.06] ring-1 ring-accent-500 dark:border-accent-400 dark:ring-accent-400/60"
                    : "border-slate-200 bg-white hover:border-accent-300 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.04]"
                }`}
              >
                {p.key === "PRO" && !active ? (
                  <span className="absolute -top-2 right-2 rounded-full bg-accent-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#ffffff]">
                    Popular
                  </span>
                ) : null}
                {active ? (
                  <span className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full bg-accent-500 text-[#ffffff]">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                ) : null}
                <span className="block text-sm font-bold text-slate-900 dark:text-white">{p.name}</span>
                <span className="block text-xs font-semibold text-accent-600 dark:text-accent-300">{p.price}</span>
                <span className="mt-1 block text-[11px] leading-tight text-slate-500 dark:text-white/45">{p.blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Country access — pick up to the plan's allowance. */}
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">

          <p className="text-[13px] font-semibold text-slate-700 dark:text-white/80">
            Which countries do you sell into?
          </p>
          <span
            className={`text-[11px] font-semibold ${
              selectedCountries.length === countryCap
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-slate-400 dark:text-white/40"
            }`}
          >
            {selectedCountries.length} of {countryCap} selected
          </span>
        </div>

        {/* Your picks, visible at a glance and removable — otherwise a chosen
            country is lost somewhere in a 209-row scroll list. */}
        {selectedCountries.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {selectedCountries.map((code) => {
              const match = countries.find((c) => c.country === code);
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleCountry(code)}
                  className="inline-flex items-center gap-1 rounded-full bg-accent-500/10 py-1 pl-2.5 pr-1.5 text-xs font-semibold text-accent-600 transition-colors hover:bg-accent-500/20 dark:text-accent-300"
                  aria-label={`Remove ${match?.countryName ?? code}`}
                >
                  {match?.countryName ?? code}
                  <X className="h-3 w-3" />
                </button>
              );
            })}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.04]">
          <div className="relative border-b border-slate-100 dark:border-white/10">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
              placeholder="Search countries…"
              className="w-full bg-transparent py-2 pl-9 pr-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-white/30"
            />
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {countriesLoading ? (
              <p className="px-2 py-3 text-sm text-slate-400 dark:text-white/40">Loading countries…</p>
            ) : visibleCountries.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-400 dark:text-white/40">
                No countries match &ldquo;{countrySearch}&rdquo;.
              </p>
            ) : (
              visibleCountries.map((option) => {
                const checked = selectedCountries.includes(option.country);
                const atCap = !checked && selectedCountries.length >= countryCap;
                return (
                  <label
                    key={option.country}
                    title={atCap ? `Your ${plan} plan covers ${countryCap}. Remove one to swap.` : undefined}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                      atCap
                        ? "cursor-not-allowed text-slate-300 dark:text-white/25"
                        : "cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.05]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={atCap}
                      onChange={() => toggleCountry(option.country)}
                      className="h-3.5 w-3.5 rounded border-slate-300 accent-accent-500 dark:border-white/20"
                    />
                    <span className={atCap ? "" : "text-slate-700 dark:text-white/75"}>
                      {option.countryName}{" "}
                      <span className={atCap ? "" : "text-slate-400 dark:text-white/40"}>({option.country})</span>
                    </span>
                  </label>
                );
              })
            )}
          </div>
        </div>

        <p className="mt-1.5 text-[11px] text-slate-400 dark:text-white/40">
          {selectedCountries.length >= countryCap
            ? `${PLANS.find((p) => p.key === plan)?.name} covers ${countryCap} ${countryCap === 1 ? "country" : "countries"} — pick a bigger plan for more.`
            : "You'll only see vessels arriving at ports in the countries you pick."}
        </p>
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


      <CaptchaField onToken={setCaptchaToken} className="pt-1" />

      <label className="flex items-start gap-2.5 cursor-pointer select-none">
        <input
          name="termsAccepted"
          type="checkbox"
          defaultChecked={defaults.termsAccepted}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300 accent-accent-500 dark:border-white/20"
          required
        />
        <span className="text-xs leading-5 text-slate-500 dark:text-white/50">
          I agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-500 underline underline-offset-2 hover:text-accent-400">
            Terms
          </a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-accent-500 underline underline-offset-2 hover:text-accent-400">
            Privacy Policy
          </a>
          , and to use MariMail for permission-based business outreach only.
        </span>
      </label>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-400">
          {error}
        </div>
      ) : null}

      {/* Tell the user WHY they can't submit — a dead button with no
          explanation reads as broken. */}
      {selectedCountries.length === 0 && !pending ? (
        <p className="text-center text-xs text-slate-500 dark:text-white/50">
          Pick at least one country to continue.
        </p>
      ) : null}

      <MotionButton
        type="submit"
        size="md"
        disabled={pending || selectedCountries.length === 0}
        className="w-full"
        label={pending ? "Creating workspace…" : "Create your workspace"}
      />

      <button
        type="button"
        onClick={() => {
          setStep(1);
          setError(null);
        }}
        className="w-full text-center text-xs font-medium text-slate-500 transition-colors hover:text-accent-400 dark:text-white/50"
      >
        ← Back to your details
      </button>
      </>
      )}
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

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Filter,
  Inbox,
  ListPlus,
  LockKeyhole,
  MailPlus,
  Radar,
  Rocket,
  Route,
  Settings2,
  Ship,
  Sparkles,
  UserRoundSearch,
  Zap,
} from "lucide-react";
import type {
  CampaignItineraryProgress,
  CampaignItineraryStep,
  CampaignItineraryStepId,
} from "@/lib/onboarding-types";

const stepIcons: Record<CampaignItineraryStepId, LucideIcon> = {
  "connect-inbox": Inbox,
  "select-vessels": Radar,
  "find-contacts": UserRoundSearch,
  "prepare-campaign": MailPlus,
  "build-sequence": Sparkles,
  "configure-options": Settings2,
  "launch-campaign": Rocket,
};

const dailyRoutine = [
  {
    title: "Check new vessels",
    description: "Open the latest arrivals in Port Radar.",
    href: "/dashboard/port-radar",
    action: "Open Port Radar",
    icon: Ship,
  },
  {
    title: "Update the same list",
    description: "Add the relevant new vessels to your existing ETA list.",
    href: "/dashboard/lists",
    action: "Open lists",
    icon: ListPlus,
  },
  {
    title: "Reveal new contacts",
    description: "Filter by title, reveal the decision-makers, and add them.",
    href: "/dashboard/lists",
    action: "Find contacts",
    icon: Filter,
  },
] as const;

function GuideUnavailable() {
  return (
    <section
      id="workflow-guide"
      aria-labelledby="workflow-guide-title"
      className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-500/10 text-accent-600 dark:text-accent-300">
          <Route className="h-5 w-5" />
        </span>
        <div>
          <h3 id="workflow-guide-title" className="font-semibold text-slate-950 dark:text-white">
            Your MariMail journey
          </h3>
        </div>
      </div>
    </section>
  );
}

function ProgressHeader({ progress }: { progress: CampaignItineraryProgress }) {
  const percentage = progress.total
    ? Math.round((progress.completedCount / progress.total) * 100)
    : 0;

  return (
    <div className="border-b border-slate-200/80 px-5 py-5 dark:border-white/10 sm:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-accent-500/20 bg-accent-500/[0.07] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-600 dark:text-accent-300">
            <Route className="h-3.5 w-3.5" />
            First campaign itinerary
          </div>
          <h3
            id="workflow-guide-title"
            className="mt-3 text-xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-2xl"
          >
            {progress.isComplete
              ? "Your ETA outreach engine is ready."
              : "One clear step at a time."}
          </h3>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600 dark:text-white/55">
            {progress.isComplete
              ? "Your one-time setup is complete. From now on, update the source list and keep the campaign settings you already chose."
              : "MariMail saves each milestone automatically, brings you back to the first unfinished step, and keeps reminding you until launch."}
          </p>
        </div>

        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-white/10 dark:bg-black/10">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-700 dark:text-white/75">
              {progress.isComplete ? "Setup complete" : "First campaign progress"}
            </span>
            <span className="text-xs font-bold tabular-nums text-slate-950 dark:text-white">
              {progress.completedCount}/{progress.total}
            </span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.08]"
            role="progressbar"
            aria-label="First campaign setup progress"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.completedCount}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-500 ${
                progress.isComplete ? "bg-emerald-500" : "bg-accent-500"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-500 dark:text-white/45">
            {progress.isComplete
              ? "All milestones completed"
              : `${progress.remainingCount} ${progress.remainingCount === 1 ? "step" : "steps"} left · progress is saved`}
          </p>
        </div>
      </div>
    </div>
  );
}

function CurrentStepCard({ step }: { step: CampaignItineraryStep }) {
  const Icon = stepIcons[step.id];

  return (
    <article className="relative overflow-hidden rounded-2xl border border-accent-500/25 bg-[radial-gradient(circle_at_top_right,rgba(79,109,255,0.18),transparent_42%),linear-gradient(145deg,rgba(79,109,255,0.08),rgba(255,255,255,0.96))] p-5 shadow-[0_18px_50px_rgba(79,109,255,0.10)] dark:border-accent-400/25 dark:bg-[radial-gradient(circle_at_top_right,rgba(79,109,255,0.20),transparent_42%),linear-gradient(145deg,rgba(79,109,255,0.13),rgba(255,255,255,0.025))] dark:shadow-none sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-accent-500 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-white shadow-sm">
          Up next
        </span>
        <span className="text-xs font-semibold tabular-nums text-accent-600 dark:text-accent-300">
          Step {step.number}
        </span>
      </div>

      <span className="mt-8 grid h-12 w-12 place-items-center rounded-2xl bg-white text-accent-600 shadow-[0_10px_28px_rgba(79,109,255,0.14)] ring-1 ring-accent-500/10 dark:bg-white/10 dark:text-accent-300 dark:shadow-none dark:ring-white/10">
        <Icon className="h-6 w-6" />
      </span>
      <h4 className="mt-5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
        {step.title}
      </h4>
      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-white/60">
        {step.description}
      </p>

      <div className="mt-5 rounded-xl border border-white/70 bg-white/65 p-3.5 dark:border-white/10 dark:bg-black/10">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-white/35">
          Why this matters
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-white/55">{step.why}</p>
      </div>

      <Link
        href={step.href}
        className="group mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-600 sm:w-auto"
      >
        {step.action}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </Link>
      <p className="mt-3 text-[11px] text-slate-500 dark:text-white/40">
        This reminder stays visible until the milestone is complete.
      </p>
    </article>
  );
}

function ItineraryList({ steps }: { steps: CampaignItineraryStep[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.025] dark:shadow-none sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-950 dark:text-white">Your itinerary</h4>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500 dark:bg-white/[0.06] dark:text-white/50">
          Auto-saved
        </span>
      </div>

      <ol>
        {steps.map((step, index) => {
          const Icon = stepIcons[step.id];
          const isComplete = step.status === "complete";
          const isCurrent = step.status === "current";
          const row = (
            <div
              className={`flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                isCurrent
                  ? "border-accent-500/35 bg-accent-500/[0.06]"
                  : isComplete
                    ? "border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-400/15 dark:bg-emerald-400/[0.05]"
                    : "border-transparent bg-slate-50/70 dark:bg-white/[0.025]"
              }`}
            >
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                  isComplete
                    ? "bg-emerald-500 text-white"
                    : isCurrent
                      ? "bg-accent-500 text-white"
                      : "bg-slate-200/80 text-slate-400 dark:bg-white/[0.07] dark:text-white/30"
                }`}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : step.status === "locked" ? (
                  <LockKeyhole className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate text-sm font-semibold ${
                    step.status === "locked"
                      ? "text-slate-400 dark:text-white/35"
                      : "text-slate-900 dark:text-white"
                  }`}
                >
                  {step.number}. {step.shortTitle}
                </span>
                <span
                  className={`mt-0.5 block text-[11px] font-medium ${
                    isComplete
                      ? "text-emerald-700 dark:text-emerald-300"
                      : isCurrent
                        ? "text-accent-600 dark:text-accent-300"
                        : "text-slate-400 dark:text-white/30"
                  }`}
                >
                  {isComplete ? "Completed" : isCurrent ? "Do this now" : "Unlocks next"}
                </span>
              </span>
              {isCurrent ? <ArrowRight className="h-4 w-4 shrink-0 text-accent-500" /> : null}
            </div>
          );

          return (
            <li key={step.id} className="relative flex gap-3 pb-2.5 last:pb-0">
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className={`absolute left-[17px] top-8 h-[calc(100%-1.25rem)] w-px ${
                    isComplete ? "bg-emerald-300 dark:bg-emerald-400/30" : "bg-slate-200 dark:bg-white/10"
                  }`}
                />
              ) : null}
              {isCurrent ? (
                <Link href={step.href} className="relative min-w-0 flex-1 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500">
                  {row}
                </Link>
              ) : (
                <div className="relative min-w-0 flex-1">{row}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DailyWorkflow() {
  return (
    <div className="space-y-4 p-5 sm:p-6">
      <div className="grid gap-3 md:grid-cols-3">
        {dailyRoutine.map((step, index) => {
          const Icon = step.icon;
          return (
            <Link
              key={step.title}
              href={step.href}
              className="group relative rounded-xl border border-slate-200 bg-white/85 p-4 transition-all hover:-translate-y-0.5 hover:border-accent-400 hover:shadow-md dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-accent-400/50 dark:hover:shadow-none"
            >
              <div className="flex items-center justify-between">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent-500/10 text-accent-600 dark:text-accent-300">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[11px] font-bold tabular-nums text-slate-300 dark:text-white/25">
                  0{index + 1}
                </span>
              </div>
              <h4 className="mt-4 text-sm font-semibold text-slate-950 dark:text-white">{step.title}</h4>
              <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-white/50">
                {step.description}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent-600 dark:text-accent-300">
                {step.action}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          );
        })}
      </div>

      <aside className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-400/20 dark:bg-emerald-400/[0.07] sm:flex-row sm:items-center">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500 text-white shadow-sm">
          <Zap className="h-5 w-5 fill-current" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
            The running campaign keeps the same setup.
          </p>
          <p className="mt-1 text-xs leading-5 text-emerald-800/80 dark:text-emerald-200/70">
            New contacts added to its linked list flow into the existing campaign with the same
            sequence, inbox rotation, schedule, and sending options.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-white/10 dark:text-emerald-200 dark:ring-emerald-400/20">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Automation active
        </span>
      </aside>
    </div>
  );
}

export function WorkflowJourney({ progress }: { progress: CampaignItineraryProgress }) {
  if (!progress.available) return <GuideUnavailable />;

  return (
    <section
      id="workflow-guide"
      aria-labelledby="workflow-guide-title"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] shadow-sm dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] dark:shadow-none"
    >
      <ProgressHeader progress={progress} />

      {progress.isComplete ? (
        <DailyWorkflow />
      ) : progress.nextStep ? (
        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
            <CurrentStepCard step={progress.nextStep} />
            <ItineraryList steps={progress.steps} />
          </div>

          <details className="group rounded-xl border border-slate-200 bg-white/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.025]">
            <summary className="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold text-slate-800 marker:content-none dark:text-white/80">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                <Zap className="h-4 w-4" />
              </span>
              What becomes automatic after launch?
              <ArrowRight className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-90" />
            </summary>
            <p className="ml-11 mt-2 max-w-3xl text-xs leading-5 text-slate-500 dark:text-white/50">
              On later days, you only check new vessels, add them to the same list, and reveal the
              right contacts. MariMail keeps the campaign&rsquo;s existing sequence and sending settings,
              so you do not rebuild the campaign.
            </p>
          </details>
        </div>
      ) : null}
    </section>
  );
}

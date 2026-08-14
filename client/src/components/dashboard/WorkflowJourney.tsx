import Link from "next/link";
import {
  ArrowRight,
  Check,
  Filter,
  ListPlus,
  MailPlus,
  Radar,
  Rocket,
  Settings2,
  Ship,
  Sparkles,
  UserRoundSearch,
  Zap,
} from "lucide-react";

type JourneyStep = {
  title: string;
  description: string;
  href: string;
  action: string;
  icon: typeof Radar;
};

const setupSteps: JourneyStep[] = [
  {
    title: "Choose vessels",
    description: "Open Port Radar and select the arriving vessels you want to target.",
    href: "/dashboard/port-radar",
    action: "Open Port Radar",
    icon: Radar,
  },
  {
    title: "Build your lead list",
    description: "Add those selected vessels to one list that will feed your campaign.",
    href: "/dashboard/lists",
    action: "View lists",
    icon: ListPlus,
  },
  {
    title: "Find the right contacts",
    description: "Open the list, filter by the job titles you need, reveal the matches, and add them.",
    href: "/dashboard/lists",
    action: "Find contacts",
    icon: UserRoundSearch,
  },
  {
    title: "Create an ETA campaign",
    description: "Rename the campaign and select the lead list you just prepared.",
    href: "/dashboard/campaigns/eta",
    action: "ETA campaigns",
    icon: MailPlus,
  },
  {
    title: "Create your sequence",
    description: "Write the first email and add follow-ups with the timing you want.",
    href: "/dashboard/campaigns/eta",
    action: "Build sequence",
    icon: Sparkles,
  },
  {
    title: "Choose your options",
    description: "Set the inbox, sending schedule, daily limit, and other campaign preferences.",
    href: "/dashboard/campaigns/eta",
    action: "Campaign options",
    icon: Settings2,
  },
  {
    title: "Launch",
    description: "Review everything once, launch the campaign, and let the workflow take over.",
    href: "/dashboard/campaigns/eta",
    action: "Review campaigns",
    icon: Rocket,
  },
];

const dailySteps: JourneyStep[] = [
  {
    title: "Check new vessels",
    description: "Return to Port Radar and open the latest vessel updates.",
    href: "/dashboard/port-radar",
    action: "See new arrivals",
    icon: Ship,
  },
  {
    title: "Add them to the same list",
    description: "Select the relevant vessels and add them to your campaign's lead list.",
    href: "/dashboard/lists",
    action: "Open lead lists",
    icon: ListPlus,
  },
  {
    title: "Reveal new contacts",
    description: "Filter by job title, reveal the right people, and add them to that list. You're done.",
    href: "/dashboard/lists",
    action: "Find contacts",
    icon: Filter,
  },
];

function StepCard({ step, index }: { step: JourneyStep; index: number }) {
  const Icon = step.icon;

  return (
    <li className="group relative flex min-h-[184px] flex-col rounded-xl border border-slate-200/90 bg-white/90 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent-400 hover:shadow-md dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none dark:hover:border-accent-400/50">
      <div className="flex items-center justify-between">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent-500/10 text-accent-600 dark:bg-accent-400/10 dark:text-accent-300">
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-bold tabular-nums text-slate-300 dark:text-white/25">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <h4 className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">{step.title}</h4>
      <p className="mt-1.5 flex-1 text-xs leading-5 text-slate-500 dark:text-white/50">
        {step.description}
      </p>
      <Link
        href={step.href}
        className="mt-3 inline-flex w-fit items-center gap-1 text-xs font-semibold text-accent-600 hover:text-accent-500 dark:text-accent-300 dark:hover:text-accent-200"
      >
        {step.action}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}

/**
 * The product's operating loop, explained where a new user first lands.
 *
 * The important distinction is time: campaign configuration happens once;
 * after that, a user only identifies each day's new vessels and contacts. The
 * live campaign keeps consuming additions to its selected list with the same
 * sequence and sending options.
 */
export function WorkflowJourney() {
  return (
    <section
      id="workflow-guide"
      aria-labelledby="workflow-guide-title"
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top_right,rgba(79,109,255,0.12),transparent_34%),linear-gradient(180deg,#ffffff,#f8fafc)] shadow-sm dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_right,rgba(79,109,255,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))] dark:shadow-none"
    >
      <div className="border-b border-slate-200/80 px-5 py-6 dark:border-white/10 sm:px-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-accent-500/20 bg-accent-500/[0.07] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-600 dark:text-accent-300">
              <Sparkles className="h-3.5 w-3.5" />
              Your MariMail journey
            </div>
            <h3
              id="workflow-guide-title"
              className="mt-3 text-xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-2xl"
            >
              Set up once. Keep outreach moving in minutes.
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-white/55">
              Connect vessel arrivals to the right decision-makers, then let one running ETA campaign
              pick up every new contact you add to its lead list.
            </p>
          </div>

          <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white/80 dark:border-white/10 dark:bg-black/10">
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/35">
                Set up
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">Once</p>
            </div>
            <div className="border-x border-slate-200 px-4 py-3 dark:border-white/10">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/35">
                Daily
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">3 actions</p>
            </div>
            <div className="px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/35">
                Campaign
              </p>
              <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Auto
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-7 p-5 sm:p-6">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-900 text-[11px] font-bold text-white dark:bg-white dark:text-slate-950">
              1
            </span>
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">One-time campaign setup</h4>
              <p className="text-xs text-slate-500 dark:text-white/45">Prepare the list, message, and sending rules.</p>
            </div>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {setupSteps.map((step, index) => (
              <StepCard key={step.title} step={step} index={index} />
            ))}
          </ol>
        </div>

        <div className="relative flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" aria-hidden="true" />
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
            <Check className="h-3.5 w-3.5" />
            Campaign is now live
          </span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-white/10" aria-hidden="true" />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr,320px]">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-500 text-[11px] font-bold text-white">
                2
              </span>
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Your quick daily routine</h4>
                <p className="text-xs text-slate-500 dark:text-white/45">Only handle what is new; keep the setup you already made.</p>
              </div>
            </div>
            <ol className="grid gap-3 md:grid-cols-3">
              {dailySteps.map((step, index) => (
                <StepCard key={step.title} step={step} index={index} />
              ))}
            </ol>
          </div>

          <aside className="relative overflow-hidden rounded-xl border border-accent-500/25 bg-accent-500/[0.07] p-5 dark:border-accent-400/20 dark:bg-accent-400/[0.08] xl:mt-[59px]">
            <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-accent-500/10 blur-2xl" />
            <span className="relative grid h-9 w-9 place-items-center rounded-lg bg-accent-500 text-white shadow-sm">
              <Zap className="h-4 w-4 fill-current" />
            </span>
            <p className="relative mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-accent-600 dark:text-accent-300">
              Automation takes it from here
            </p>
            <h4 className="relative mt-2 text-base font-semibold leading-6 text-slate-950 dark:text-white">
              New contacts join the running campaign automatically.
            </h4>
            <p className="relative mt-2 text-xs leading-5 text-slate-600 dark:text-white/55">
              Because the campaign is connected to that lead list, every new contact follows the same
              sequence, inbox, schedule, and options you already chose. No campaign rebuild needed.
            </p>
            <Link
              href="/dashboard/port-radar"
              className="relative mt-5 inline-flex items-center gap-2 rounded-lg bg-accent-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-accent-600"
            >
              Start in Port Radar
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </aside>
        </div>
      </div>
    </section>
  );
}

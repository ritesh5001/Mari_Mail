"use client";

import {
  Anchor,
  ArrowRight,
  Ban,
  Gift,
  BarChart3,
  Bookmark,
  Calendar,
  ChevronDown,
  CreditCard,
  Database,
  Inbox,
  LayoutDashboard,
  List,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  Play,
  Radar,
  Settings,
  Ship,
  Users,
  X,
  Zap,
  CalendarClock,
  KeyRound,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AuthSession, WorkspaceSummary } from "@marimail/types";
import { apiFetch } from "@/lib/browser-fetch";
import { cn } from "@/lib/cn";
import { CommandPalette } from "./CommandPalette";
import { Sidebar, SidebarBody, useSidebar } from "@/components/ui/sidebar";
import { SidebarCustomizePanel } from "./SidebarCustomizePanel";
import { ThemeToggle } from "./ThemeToggle";
import { CreditBadge } from "@/components/dashboard/CreditBadge";
import { TrialBanner } from "./TrialBanner";
import type { CampaignItineraryProgress } from "@/lib/onboarding-types";
import type { ActivityItem } from "@/lib/activity-data";
import { ActivityBell } from "./ActivityBell";
import { WhatsAppHeaderButton } from "@/components/marketing/WhatsAppButton";

/**
 * Sidebar sections, in the order they appear.
 *
 * Twenty flat links is a wall to scan every time. Grouping them means the eye
 * lands on a heading first and only reads the four items under it — and it
 * makes the admin tools read as a separate area of the product rather than
 * more of the same list.
 */
const NAV_GROUPS = ["main", "outreach", "data", "insights", "account", "admin"] as const;
type NavGroup = (typeof NAV_GROUPS)[number];

/** `null` = no heading; the first group needs no label to explain itself. */
const GROUP_LABEL: Record<NavGroup, string | null> = {
  main: null,
  outreach: "Outreach",
  data: "Data",
  insights: "Insights",
  account: "Account",
  admin: "Admin",
};

type NavItem = {
  href: string;
  label: string;
  group: NavGroup;
  icon: typeof LayoutDashboard;
  superAdminOnly?: boolean;
  /** Visible to the active workspace's OWNER/ADMIN — not to platform staff. See `canViewNavItem`. */
  billingManagerOnly?: boolean;
  alwaysVisible?: boolean;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", group: "main", icon: LayoutDashboard, alwaysVisible: true },

  // The daily workflow, in the order the job is done: find the vessels
  // arriving, put the people in a list, fire the ETA campaign off it, then the
  // inbox and cold outreach. These five stay CONTIGUOUS — anything new goes in
  // another group, not in the middle, or the sequence stops reading as one.
  { href: "/dashboard/port-radar", label: "ETA / Port Radar", group: "outreach", icon: Radar },
  { href: "/dashboard/lists", label: "Lists", group: "outreach", icon: List },
  { href: "/dashboard/campaigns/eta", label: "ETA campaigns", group: "outreach", icon: Megaphone },
  { href: "/dashboard/inboxes", label: "Inboxes", group: "outreach", icon: Inbox },
  { href: "/dashboard/campaigns/cold", label: "Cold campaigns", group: "outreach", icon: Mail },

  // What you have already collected, and the rules about who not to contact —
  // reference material rather than a step in the workflow.
  { href: "/dashboard/vessels", label: "Vessels", group: "data", icon: Ship, superAdminOnly: true },
  { href: "/dashboard/saved", label: "Revealed contacts", group: "data", icon: Bookmark },
  // Blocked moved into Settings — it is a standing rule, not a data set.
  { href: "/dashboard/marine-db", label: "Marine DB", group: "data", icon: Anchor, superAdminOnly: true },

  { href: "/dashboard/analytics", label: "Analytics", group: "insights", icon: BarChart3 },

  { href: "/dashboard/billing", label: "Plan & billing", group: "account", icon: CreditCard, billingManagerOnly: true },
  { href: "/dashboard/referrals", label: "Refer & earn", group: "account", icon: Gift },
  // Customer-facing settings: profile, security, personas, blocked, and the
  // per-workspace campaign rules. It used to sit in the Admin group behind a
  // superAdminOnly flag, which hid every one of those from the people they
  // belong to — see settings/layout.tsx.
  { href: "/dashboard/settings", label: "Settings", group: "account", icon: Settings },

  // Platform staff only. Its own group so it reads as a separate area of the
  // product rather than eight more rows on the customer's list.
  { href: "/dashboard/admin/users", label: "Users", group: "admin", icon: Users, superAdminOnly: true },
  { href: "/dashboard/admin/demos", label: "Demo Bookings", group: "admin", icon: Calendar, superAdminOnly: true },
  { href: "/dashboard/admin/data-sources", label: "Data Sources", group: "admin", icon: Settings, superAdminOnly: true },
  { href: "/dashboard/admin/maribiz", label: "Secondary Data Source", group: "admin", icon: Database, superAdminOnly: true },
  { href: "/dashboard/admin/contact-source", label: "Contact Data Source", group: "admin", icon: Zap, superAdminOnly: true },
  { href: "/dashboard/admin/contact-source/drips", label: "Scheduled Reveals", group: "admin", icon: CalendarClock, superAdminOnly: true },
  { href: "/dashboard/admin/contact-source/accounts", label: "Provider Accounts", group: "admin", icon: KeyRound, superAdminOnly: true },
];


/**
 * A nav item is visible if it has no restriction, or the session clears
 * whichever restriction it does have. Matches the rules enforced server-side,
 * so the sidebar never advertises a link the user would be redirected away
 * from.
 *
 * `billingManagerOnly` is the OWNER/ADMIN of the active workspace and
 * deliberately EXCLUDES super-admins. Platform staff run the admin panel —
 * they manage customers, they are not customers, and a plan or an invoice is
 * not theirs to look at. Their billing-adjacent work (granting country access,
 * issuing payment links) lives in the admin routes instead.
 */
function canViewNavItem(item: NavItem, session: AuthSession): boolean {
  if (item.superAdminOnly && !session.user.isSuperAdmin) return false;
  if (item.billingManagerOnly) {
    if (session.user.isSuperAdmin) return false;
    const role = session.activeWorkspace?.role;
    if (role !== "OWNER" && role !== "ADMIN") return false;
  }
  return true;
}

/** A single nav row that reveals its label as the sidebar expands (brand-blue active state). */
function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const { open, animate } = useSidebar();
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      className={cn(
        "group/nav relative flex h-11 items-center gap-3 rounded-lg px-[15px] transition-colors",
        active
          ? "bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-white/55 dark:hover:bg-white/[0.06] dark:hover:text-white",
      )}
    >
      {active && (
        <span className="absolute left-[-12px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-accent-500 dark:bg-accent-400" />
      )}
      <Icon className="h-[18px] w-[18px] flex-shrink-0" />
      <motion.span
        animate={{
          display: animate ? (open ? "inline-block" : "none") : "inline-block",
          opacity: animate ? (open ? 1 : 0) : 1,
        }}
        className="whitespace-pre text-sm font-medium"
      >
        {item.label}
      </motion.span>
    </Link>
  );
}

/** Section heading. Fades out with the labels when the rail collapses. */
function NavGroupLabel({ label }: { label: string }) {
  const { open, animate } = useSidebar();
  return (
    <motion.p
      animate={{
        // ONLY opacity. Animating height (0 → auto) made the whole rail grow
        // taller the moment it was hovered — five headings appearing at once
        // pushed every row down and the sidebar visibly jumped. The row keeps
        // its height in both states, so expanding changes the width and
        // nothing else; collapsed, the reserved strip reads as the gap above
        // a divider.
        opacity: animate ? (open ? 1 : 0) : 1,
      }}
      // Fixed height, not padding-driven: `h-5` plus the group's own border and
      // top padding is what holds the space steady between the two states.
      className="mt-3 flex h-5 items-end overflow-hidden whitespace-pre px-[15px] text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/30"
    >
      {label}
    </motion.p>
  );
}

/**
 * The nav, grouped into sections.
 *
 * Shared by the desktop rail and the mobile sheet so the two can't drift into
 * different orders or different groupings — they did exactly that with the flat
 * list, since each rendered its own copy of the same `.map`.
 *
 * A group whose items are all hidden — by role, or by the user's own
 * customisation — renders nothing at all, heading included. A lone heading over
 * empty space reads as something failing to load.
 */
function NavSections({
  session,
  hiddenNavItems,
  pathname,
  variant = "rail",
}: {
  session: AuthSession;
  hiddenNavItems: string[];
  pathname: string;
  /**
   * "rail" is the collapsible desktop sidebar; "sheet" is the mobile drawer,
   * which renders OUTSIDE the sidebar provider — so it cannot use the animated
   * row and heading, both of which read `useSidebar()`.
   */
  variant?: "rail" | "sheet";
}) {
  return (
    <>
      {NAV_GROUPS.map((group) => {
        const items = navItems.filter(
          (item) =>
            item.group === group &&
            canViewNavItem(item, session) &&
            (item.alwaysVisible || !hiddenNavItems.includes(item.href)),
        );
        if (items.length === 0) return null;

        const label = GROUP_LABEL[group];
        return (
          <div key={group} className={cn(label && "border-t border-slate-100 pt-1 dark:border-white/[0.04]")}>
            {label ? (
              variant === "rail" ? (
                <NavGroupLabel label={label} />
              ) : (
                <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/30">
                  {label}
                </p>
              )
            ) : null}
            <div className="space-y-1">
              {items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                if (variant === "rail") {
                  return <NavRow key={item.href} item={item} active={active} />;
                }
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                      active
                        ? "bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-white/70 dark:hover:bg-white/[0.06] dark:hover:text-white",
                    )}
                  >
                    <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** Logo that shows the wordmark when open, just the mark when collapsed. */
function SidebarLogo() {
  const { open, animate } = useSidebar();
  return (
    <Link
      href="/dashboard"
      aria-label="MariMail home"
      className="flex h-10 items-center gap-2 px-[11px]"
    >
      {/* Collapsed rail is ~28px wide — a stacked lockup can't render there, so
          the mark stands in. Expanded, the full lockup replaces both the mark
          and the old text wordmark, which is why no <span> follows it. */}
      {open ? (
        <motion.img
          key="lockup"
          src="/logo.png"
          alt="MariMail"
          initial={{ opacity: animate ? 0 : 1 }}
          animate={{ opacity: 1 }}
          className="h-9 w-auto object-contain"
        />
      ) : (
        <img
          src="/logo-mark.png"
          alt="MariMail"
          className="h-7 w-7 flex-shrink-0 object-contain"
        />
      )}
    </Link>
  );
}

function SidebarContent({
  session,
  hiddenNavItems,
  setHiddenNavItems,
  onLogout,
}: {
  session: AuthSession;
  hiddenNavItems: string[];
  setHiddenNavItems: (hidden: string[]) => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const { open, animate } = useSidebar();
  const userInitial = session.user.name?.slice(0, 1).toUpperCase() ?? "U";

  return (
    <>
      <SidebarLogo />

      <nav className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NavSections session={session} hiddenNavItems={hiddenNavItems} pathname={pathname} />
      </nav>

      <div className="mt-2 border-t border-slate-100 pt-2 dark:border-white/[0.04]">
        <SidebarCustomizePanel
          items={navItems
            .filter((item) => !item.alwaysVisible && canViewNavItem(item, session))
            .map((item) => ({ href: item.href, label: item.label, icon: item.icon }))}
          hidden={hiddenNavItems}
          onChange={setHiddenNavItems}
        />
      </div>

      <div className="mt-2 border-t border-slate-100 pt-2 dark:border-white/[0.04]">
        <button
          type="button"
          onClick={onLogout}
          className="flex h-11 w-full items-center gap-3 rounded-lg px-[7px] text-left transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.06]"
          aria-label="Log out"
        >
          <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#4F6DFF] to-[#2A38B8] text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]">
            {userInitial}
          </span>
          <motion.span
            animate={{
              display: animate ? (open ? "flex" : "none") : "flex",
              opacity: animate ? (open ? 1 : 0) : 1,
            }}
            className="min-w-0 flex-1 items-center justify-between gap-2 whitespace-pre"
          >
            <span className="min-w-0 truncate text-sm font-medium text-slate-700 dark:text-white/80">
              {session.user.name ?? "Account"}
            </span>
            <LogOut className="h-4 w-4 flex-shrink-0 text-slate-400 dark:text-white/50" />
          </motion.span>
        </button>
      </div>
    </>
  );
}

export function DashboardShell({
  session,
  onboardingProgress,
  activity,
  children,
}: {
  session: AuthSession;
  onboardingProgress: CampaignItineraryProgress;
  /** Recent workspace activity for the header bell, loaded by the layout. */
  activity: ActivityItem[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState(session.activeWorkspace);
  const [hiddenNavItems, setHiddenNavItems] = useState(session.user.hiddenNavItems ?? []);
  const setupInProgress =
    onboardingProgress.available &&
    !onboardingProgress.isComplete &&
    onboardingProgress.nextStep !== null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      apiFetch(`/auth/refresh`, {
        method: "POST",
      }).catch(() => undefined);
    }, 12 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, []);

  // Vessel/contact actions happen in several client-heavy screens. Refreshing
  // the server snapshot while setup is active lets the global prompt advance
  // even when the completing action itself does not navigate to a new route.
  useEffect(() => {
    if (!setupInProgress) return;
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [router, setupInProgress]);

  const breadcrumb = useMemo(() => {
    const [, , child] = pathname.split("/");
    if (!child) return "Overview";
    // Friendly overrides where the URL segment doesn't match the display name.
    const overrides: Record<string, string> = { saved: "Revealed contacts" };
    if (overrides[child]) return overrides[child];
    return child
      .split("-")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }, [pathname]);

  async function switchWorkspace(workspace: WorkspaceSummary) {
    const response = await apiFetch(`/workspaces/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId: workspace.id }),
    });

    if (response.ok) {
      setActiveWorkspace(workspace);
      router.refresh();
    }
  }

  async function logout() {
    await apiFetch(`/auth/logout`, { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F0F9FF_46%,#F8FAFC_100%)] text-slate-900 dark:!bg-[#050507] dark:text-white/90">
      {/* Desktop: hover-to-expand rail, fixed to the viewport edge. Sits above
          all page content (sticky table headers reach z-50) but below true
          modals (z-[70]+), so it never gets sliced by a sticky <thead>. */}
      <aside className="fixed inset-y-0 left-0 z-[60] hidden border-r border-slate-200/80 bg-white/95 shadow-[10px_0_36px_rgba(15,23,42,0.06)] dark:border-white/[0.06] dark:bg-[#0A0A0C] dark:shadow-none lg:block">
        <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
          <SidebarBody className="h-full justify-between">
            <SidebarContent
              session={session}
              hiddenNavItems={hiddenNavItems}
              setHiddenNavItems={setHiddenNavItems}
              onLogout={logout}
            />
          </SidebarBody>
        </Sidebar>
      </aside>

      <div className="min-h-screen dark:bg-[#050507] lg:pl-[68px]">
        <header className="sticky top-0 z-[55] border-b border-slate-200/80 bg-white/90 shadow-[0_8px_26px_rgba(15,23,42,0.04)] backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#0A0A0C]/85 dark:shadow-none">
          <div className="flex h-16 items-center gap-3 px-5">
            {/* Mobile hamburger drawer */}
            <div className="lg:hidden">
              <MobileNav
                session={session}
                hiddenNavItems={hiddenNavItems}
                setHiddenNavItems={setHiddenNavItems}
                onLogout={logout}
              />
            </div>

            <div className="flex min-w-0 items-center gap-3">
              <h1 className="truncate text-base font-semibold text-slate-950 dark:text-white">{breadcrumb}</h1>
              <Link
                href="/dashboard#workflow-guide"
                className={`hidden h-7 items-center gap-1.5 rounded-full border pl-1 pr-2.5 text-[12px] font-medium transition-colors sm:pr-3 md:inline-flex ${
                  setupInProgress
                    ? "border-accent-500/30 bg-accent-500/[0.08] text-accent-700 hover:bg-accent-500/[0.13] dark:border-accent-400/25 dark:bg-accent-400/10 dark:text-accent-200"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-accent-50 hover:text-accent-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08] dark:hover:text-white"
                }`}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white/80 text-current shadow-sm dark:bg-white/[0.08] dark:shadow-none">
                  <Play className="h-3 w-3 fill-current" />
                </span>
                <span className="hidden sm:inline">{setupInProgress ? "Setup" : "How it works"}</span>
                {setupInProgress ? (
                  <span className="min-w-4 rounded-full bg-accent-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                    {onboardingProgress.remainingCount}
                  </span>
                ) : null}
              </Link>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Leftmost of the header controls, the way Apollo places it —
                  the number you're spending should be visible wherever you
                  happen to be spending it. */}
              <CreditBadge />

              <button
                type="button"
                aria-label="Announcements"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08] dark:hover:text-white"
              >
                <Megaphone className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#EF4444] shadow-[0_0_0_2px_#fff] dark:shadow-[0_0_0_2px_#0A0A0C]" />
              </button>

              <ActivityBell items={activity} />

              {/* Support is a WhatsApp conversation for most of this audience,
                  so the way to start one is in the chrome on every page rather
                  than only on the public site. */}
              <WhatsAppHeaderButton />

              <div className="group relative">
                <button
                  type="button"
                  className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition-colors hover:border-accent-200 hover:bg-accent-50 hover:text-accent-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:bg-white/[0.08] dark:hover:text-white"
                >
                  <span className="max-w-[10rem] truncate">{activeWorkspace?.name ?? "Workspace"}</span>
                  <ChevronDown className="h-4 w-4 text-slate-400 dark:text-white/50" />
                </button>
                <div className="invisible absolute right-0 z-30 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-1 opacity-0 shadow-[0_18px_50px_rgba(15,23,42,0.16)] transition group-hover:visible group-hover:opacity-100 dark:border-white/10 dark:bg-[#0F0D14] dark:shadow-[0_18px_60px_rgba(0,0,0,0.55)]">
                  {session.workspaces.map((workspace) => {
                    const isActive = workspace.id === activeWorkspace?.id;
                    return (
                      <button
                        key={workspace.id}
                        type="button"
                        onClick={() => switchWorkspace(workspace)}
                        className={`block w-full truncate rounded px-2 py-2 text-left text-sm transition-colors ${
                          isActive
                            ? "bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:text-white/75 dark:hover:bg-white/[0.06] dark:hover:text-white"
                        }`}
                      >
                        {workspace.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-4rem)] bg-transparent px-5 py-6 dark:bg-[#050507]">
          <TrialBanner workspace={activeWorkspace} isSuperAdmin={session.user.isSuperAdmin} />
          {setupInProgress && pathname !== "/dashboard" && onboardingProgress.nextStep ? (
            <div className="mb-4 flex flex-col gap-3 rounded-xl border border-accent-500/25 bg-accent-500/[0.07] px-4 py-3 dark:border-accent-400/20 dark:bg-accent-400/[0.08] sm:flex-row sm:items-center">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-500 text-white shadow-sm">
                <Play className="h-4 w-4 fill-current" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-600 dark:text-accent-300">
                  First campaign · {onboardingProgress.completedCount}/{onboardingProgress.total} done
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-white">
                  Next: {onboardingProgress.nextStep.title}
                </p>
              </div>
              <Link
                href={onboardingProgress.nextStep.href}
                className="group inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent-500 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-600"
              >
                Continue setup
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          ) : null}
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

/** Mobile slide-in drawer: same nav, always-expanded labels. */
function MobileNav({
  session,
  hiddenNavItems,
  setHiddenNavItems,
  onLogout,
}: {
  session: AuthSession;
  hiddenNavItems: string[];
  setHiddenNavItems: (hidden: string[]) => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70"
      >
        <Menu className="h-4 w-4" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[90] bg-slate-950/40 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.28, ease: "easeInOut" }}
              className="fixed inset-y-0 left-0 z-[100] flex w-[260px] flex-col border-r border-slate-200 bg-white px-3 py-4 dark:border-white/[0.06] dark:bg-[#0A0A0C]"
            >
              <div className="flex items-center justify-between px-2">
                <Link href="/dashboard" className="flex items-center gap-2" onClick={() => setOpen(false)}>
                  {/* Full lockup — carries its own wordmark, so no text span. */}
                  <img src="/logo.png" alt="MariMail" className="h-10 w-auto object-contain" />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:text-white/50 dark:hover:bg-white/[0.06]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto">
                <NavSections
                  session={session}
                  hiddenNavItems={hiddenNavItems}
                  pathname={pathname}
                  variant="sheet"
                />
              </nav>

              <div className="mt-2 border-t border-slate-100 pt-2 dark:border-white/[0.04]">
                <SidebarCustomizePanel
                  items={navItems
                    .filter((item) => !item.alwaysVisible && canViewNavItem(item, session))
                    .map((item) => ({ href: item.href, label: item.label, icon: item.icon }))}
                  hidden={hiddenNavItems}
                  onChange={setHiddenNavItems}
                />
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="mt-2 flex items-center gap-3 rounded-lg border-t border-slate-100 px-2 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:border-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.06]"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

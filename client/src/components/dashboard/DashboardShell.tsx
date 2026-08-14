"use client";

import {
  Anchor,
  Ban,
  Gift,
  BarChart3,
  Bell,
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

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  superAdminOnly?: boolean;
  /** Visible to the active workspace's OWNER/ADMIN — not to platform staff. See `canViewNavItem`. */
  billingManagerOnly?: boolean;
  alwaysVisible?: boolean;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, alwaysVisible: true },
  // The daily workflow, in the order the job is done: find the vessels
  // arriving, put the people in a list, fire the ETA campaign off it, then the
  // inbox and cold outreach. These five stay CONTIGUOUS — anything new goes
  // below them, not in the middle, or the sequence stops reading as one.
  { href: "/dashboard/port-radar", label: "ETA / Port Radar", icon: Radar },
  { href: "/dashboard/lists", label: "Lists", icon: List },
  { href: "/dashboard/campaigns/eta", label: "ETA campaigns", icon: Megaphone },
  { href: "/dashboard/inboxes", label: "Inboxes", icon: Inbox },
  { href: "/dashboard/campaigns/cold", label: "Cold campaigns", icon: Mail },
  // Reference libraries — what you've already collected, rather than a step in
  // the workflow. They sat directly under Overview, which put two lookup
  // screens ahead of everything the user actually comes here to do.
  { href: "/dashboard/vessels", label: "Vessels", icon: Ship, superAdminOnly: true },
  { href: "/dashboard/saved", label: "Revealed contacts", icon: Bookmark },
  // Supporting tools — used occasionally, not every day.
  { href: "/dashboard/blocked", label: "Blocked", icon: Ban },
  { href: "/dashboard/referrals", label: "Refer & earn", icon: Gift },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/billing", label: "Plan & billing", icon: CreditCard, billingManagerOnly: true },
  { href: "/dashboard/marine-db", label: "Marine DB", icon: Anchor, superAdminOnly: true },
  { href: "/dashboard/admin/users", label: "Users", icon: Users, superAdminOnly: true },
  { href: "/dashboard/admin/demos", label: "Demo Bookings", icon: Calendar, superAdminOnly: true },
  { href: "/dashboard/admin/data-sources", label: "Data Sources", icon: Settings, superAdminOnly: true },
  { href: "/dashboard/admin/maribiz", label: "Secondary Data Source", icon: Database, superAdminOnly: true },
  { href: "/dashboard/admin/contact-source", label: "Contact Data Source", icon: Zap, superAdminOnly: true },
  { href: "/dashboard/admin/contact-source/drips", label: "Scheduled Reveals", icon: CalendarClock, superAdminOnly: true },
  { href: "/dashboard/admin/contact-source/accounts", label: "Provider Accounts", icon: KeyRound, superAdminOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, superAdminOnly: true, alwaysVisible: true },
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
          ? "bg-sky-50 text-sky-700 dark:bg-accent-500/15 dark:text-accent-300"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-white/55 dark:hover:bg-white/[0.06] dark:hover:text-white",
      )}
    >
      {active && (
        <span className="absolute left-[-12px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-sky-500 dark:bg-accent-400" />
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
        {navItems.map((item) => {
          if (!canViewNavItem(item, session)) return null;
          if (!item.alwaysVisible && hiddenNavItems.includes(item.href)) return null;
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return <NavRow key={item.href} item={item} active={active} />;
        })}
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

export function DashboardShell({ session, children }: { session: AuthSession; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState(session.activeWorkspace);
  const [hiddenNavItems, setHiddenNavItems] = useState(session.user.hiddenNavItems ?? []);

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
              <button
                type="button"
                className="hidden h-7 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 pl-1 pr-3 text-[12px] font-medium text-slate-600 transition-colors hover:bg-sky-50 hover:text-sky-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08] dark:hover:text-white md:inline-flex"
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-sky-100 text-sky-700 dark:bg-white/[0.08] dark:text-current">
                  <Play className="h-3 w-3 fill-current" />
                </span>
                Tutorial
              </button>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {/* Leftmost of the header controls, the way Apollo places it —
                  the number you're spending should be visible wherever you
                  happen to be spending it. */}
              <CreditBadge />

              <button
                type="button"
                aria-label="Announcements"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08] dark:hover:text-white"
              >
                <Megaphone className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#EF4444] shadow-[0_0_0_2px_#fff] dark:shadow-[0_0_0_2px_#0A0A0C]" />
              </button>

              <button
                type="button"
                aria-label="Notifications"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08] dark:hover:text-white"
              >
                <Bell className="h-4 w-4" />
              </button>

              <div className="group relative">
                <button
                  type="button"
                  className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition-colors hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80 dark:hover:bg-white/[0.08] dark:hover:text-white"
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
                            ? "bg-sky-50 text-sky-700 dark:bg-accent-500/15 dark:text-accent-300"
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
                {navItems.map((item) => {
                  if (!canViewNavItem(item, session)) return null;
                  if (!item.alwaysVisible && hiddenNavItems.includes(item.href)) return null;
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "bg-sky-50 text-sky-700 dark:bg-accent-500/15 dark:text-accent-300"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-white/70 dark:hover:bg-white/[0.06] dark:hover:text-white",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
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

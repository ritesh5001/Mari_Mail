"use client";

import {
  Anchor,
  BarChart3,
  Bell,
  Bookmark,
  Calendar,
  ChevronDown,
  Database,
  Inbox,
  LayoutDashboard,
  List,
  LogOut,
  Mail,
  Megaphone,
  Play,
  Radar,
  Settings,
  Ship,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AuthSession, WorkspaceSummary } from "@marimail/types";
import { apiFetch } from "@/lib/browser-fetch";
import { CommandPalette } from "./CommandPalette";
import { SidebarCustomizePanel } from "./SidebarCustomizePanel";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  superAdminOnly?: boolean;
  alwaysVisible?: boolean;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, alwaysVisible: true },
  { href: "/dashboard/vessels", label: "Vessels", icon: Ship, superAdminOnly: true },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users },
  { href: "/dashboard/saved", label: "Saved", icon: Bookmark },
  { href: "/dashboard/port-radar", label: "ETA / Port Radar", icon: Radar },
  { href: "/dashboard/lists", label: "Lists", icon: List },
  { href: "/dashboard/inboxes", label: "Inboxes", icon: Inbox },
  { href: "/dashboard/campaigns/cold", label: "Cold campaigns", icon: Mail },
  { href: "/dashboard/campaigns/eta", label: "ETA campaigns", icon: Megaphone },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/marine-db", label: "Marine DB", icon: Anchor, superAdminOnly: true },
  { href: "/dashboard/admin/demos", label: "Demo Bookings", icon: Calendar, superAdminOnly: true },
  { href: "/dashboard/admin/data-sources", label: "Data Sources", icon: Settings, superAdminOnly: true },
  { href: "/dashboard/admin/maribiz", label: "Secondary Data Source", icon: Database, superAdminOnly: true },
  { href: "/dashboard/admin/apollo", label: "Apollo Data Source", icon: Zap, superAdminOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, superAdminOnly: true, alwaysVisible: true },
];

export function DashboardShell({ session, children }: { session: AuthSession; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
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

  const userInitial = session.user.name?.slice(0, 1).toUpperCase() ?? "U";

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#F8FAFC_0%,#F0F9FF_46%,#F8FAFC_100%)] text-slate-900 dark:!bg-[#050507] dark:text-white/90">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-slate-200/80 bg-white/95 shadow-[10px_0_36px_rgba(15,23,42,0.06)] dark:border-white/[0.06] dark:bg-[#0A0A0C] dark:shadow-none lg:flex">
        <Link
          href="/dashboard"
          className="flex h-16 items-center justify-center border-b border-slate-100 dark:border-white/[0.04]"
          aria-label="MariMail home"
        >
          <img src="/logo.png" alt="MariMail" className="h-7 w-auto object-contain" />
        </Link>

        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => {
            if (item.superAdminOnly && !session.user.isSuperAdmin) return null;
            if (!item.alwaysVisible && hiddenNavItems.includes(item.href)) return null;
            const Icon = item.icon;
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group relative mx-auto flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
                  active
                    ? "bg-sky-50 text-sky-700 before:absolute before:left-[-10px] before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r before:bg-sky-500 dark:bg-accent-500/15 dark:text-accent-300 dark:before:bg-accent-400"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-white/55 dark:hover:bg-white/[0.06] dark:hover:text-white"
                }`}
                aria-label={item.label}
              >
                <Icon className="h-[18px] w-[18px]" />
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 opacity-0 shadow-[0_12px_28px_rgba(15,23,42,0.14)] transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 dark:border-white/10 dark:bg-[#15131c] dark:text-white dark:shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 p-2 dark:border-white/[0.04]">
          <SidebarCustomizePanel
            items={navItems
              .filter((item) => !item.alwaysVisible && (!item.superAdminOnly || session.user.isSuperAdmin))
              .map((item) => ({ href: item.href, label: item.label, icon: item.icon }))}
            hidden={hiddenNavItems}
            onChange={setHiddenNavItems}
          />
        </div>

        <div className="border-t border-slate-100 p-2 dark:border-white/[0.04]">
          <button
            type="button"
            onClick={logout}
            className="group relative mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#4F6DFF] to-[#2A38B8] text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2)] transition-transform hover:scale-105"
            aria-label="Log out"
          >
            {userInitial}
            <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 opacity-0 shadow-[0_12px_28px_rgba(15,23,42,0.14)] transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 dark:border-white/10 dark:bg-[#15131c] dark:text-white dark:shadow-[0_8px_24px_rgba(0,0,0,0.55)]">
              <span className="inline-flex items-center gap-1.5">
                <LogOut className="h-3 w-3" />
                Sign out
              </span>
            </span>
          </button>
        </div>
      </aside>

      <div className="min-h-screen dark:bg-[#050507] lg:pl-16">
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 shadow-[0_8px_26px_rgba(15,23,42,0.04)] backdrop-blur-xl dark:border-white/[0.06] dark:bg-[#0A0A0C]/85 dark:shadow-none">
          <div className="flex h-16 items-center gap-3 px-5">
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

        <main className="min-h-[calc(100vh-4rem)] bg-transparent px-5 py-6 dark:bg-[#050507]">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

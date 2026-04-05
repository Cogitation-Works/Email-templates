import {
  Activity,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Send,
  Shield,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/utils";
import type { Role } from "../types";

const navConfig = [
  {
    label: "Workspace",
    href: "/workspace",
    icon: LayoutDashboard,
    roles: ["super_admin", "user"] as Role[],
  },
  {
    label: "History",
    href: "/history",
    icon: History,
    roles: ["super_admin", "user"] as Role[],
  },
  {
    label: "Admin",
    href: "/admin",
    icon: Shield,
    roles: ["super_admin"] as Role[],
  },
  {
    label: "Logs",
    href: "/logs",
    icon: Activity,
    roles: ["super_admin"] as Role[],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    roles: ["super_admin", "user"] as Role[],
  },
];

interface AppShellTab {
  label: string;
  href?: string;
  active?: boolean;
  onClick?: () => void;
}

export function AppShell({
  eyebrow,
  title,
  description,
  children,
  aside,
  actions,
  topTabs,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  sidebarAction,
  dock,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
  actions?: React.ReactNode;
  topTabs?: AppShellTab[];
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  sidebarAction?: React.ReactNode;
  dock?: React.ReactNode;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shellSearch, setShellSearch] = useState("");
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  useEffect(() => {
    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < 768);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const navItems = useMemo(
    () => navConfig.filter((item) => item.roles.includes(user?.role ?? "user")),
    [user?.role],
  );

  const handleLogout = async () => {
    await signOut();
    navigate("/signin", { replace: true });
  };

  const handleSearchChange = (value: string) => {
    if (onSearchChange) {
      onSearchChange(value);
      return;
    }
    setShellSearch(value);
  };

  const handleTabSelection = (tab: AppShellTab) => {
    if (tab.onClick) {
      tab.onClick();
      return;
    }

    if (!tab.href?.startsWith("#")) {
      return;
    }

    const target = document.querySelector(tab.href);
    if (!(target instanceof HTMLElement)) {
      return;
    }

    window.history.replaceState(
      window.history.state,
      "",
      `${location.pathname}${location.search}${tab.href}`,
    );
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const isTabActive = (tab: AppShellTab) => {
    if (tab.active && (!tab.href?.startsWith("#") || !location.hash)) {
      return true;
    }
    if (!tab.href) {
      return false;
    }
    if (tab.href.startsWith("#")) {
      return location.hash === tab.href;
    }
    return location.pathname === tab.href;
  };

  const defaultSidebarAction = (
    <button
      className="mx-2 mb-8 inline-flex w-[calc(100%-1rem)] items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,var(--accent),var(--accent-strong))] px-4 py-3 text-sm font-black text-[#052113] shadow-lg shadow-[rgba(var(--accent-rgb),0.14)] transition hover:scale-[0.985]"
      onClick={() => navigate("/workspace")}
      type="button"
    >
      <Send className="h-4 w-4" />
      <span>New Outreach</span>
    </button>
  );

  return (
    <div className="min-h-screen text-[var(--text)]">
      <header className="shell-header fixed inset-x-0 top-0 z-40 border-b border-[var(--glass-line)] bg-[var(--surface-nav)] backdrop-blur-xl">
        <div className="mx-auto flex h-20 w-full items-center gap-5 px-4 sm:px-6 lg:px-10 xl:gap-8">
          <div className="flex items-center gap-3 lg:hidden">
            <button
              className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface-high)] text-[var(--text)]"
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Brand compact />
          </div>

          <div className="hidden min-w-0 flex-1 items-center gap-8 lg:flex">
            <Brand compact />
            {topTabs?.length ? (
              <nav className="hidden items-center gap-8 xl:flex">
                {topTabs.map((tab) =>
                  tab.href && !tab.href.startsWith("#") ? (
                    <NavLink
                      className={({ isActive }) =>
                        cn(
                          "border-b-2 border-transparent pb-1 text-[0.98rem] font-semibold tracking-tight text-[var(--muted)] transition hover:text-[var(--text)]",
                          (isActive || isTabActive(tab)) &&
                            "border-[var(--accent)] text-[var(--accent)]",
                        )
                      }
                      key={`${tab.label}-${tab.href}`}
                      to={tab.href}
                    >
                      {tab.label}
                    </NavLink>
                  ) : (
                    <button
                      className={cn(
                        "border-b-2 border-transparent pb-1 text-[0.98rem] font-semibold tracking-tight text-[var(--muted)] transition hover:text-[var(--text)]",
                        isTabActive(tab) &&
                          "border-[var(--accent)] text-[var(--accent)]",
                      )}
                      key={tab.label}
                      onClick={() => handleTabSelection(tab)}
                      type="button"
                    >
                      {tab.label}
                    </button>
                  ),
                )}
              </nav>
            ) : null}
          </div>

          {searchPlaceholder && !isMobileViewport ? (
            <label className="shell-search hidden max-w-md flex-[1.2] xl:flex">
              <Search className="h-4 w-4 text-[var(--soft)]" />
              <input
                onChange={(event) => handleSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                type="search"
                value={searchValue ?? shellSearch}
              />
            </label>
          ) : (
            <div className="hidden flex-1 xl:block" />
          )}

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-[var(--glass-line)] bg-[var(--surface-high)] px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[var(--soft)] lg:flex">
              <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
              <span>
                {user?.role === "super_admin" ? "Admin Live" : "Workspace Live"}
              </span>
            </div>
            <ThemeToggle />
            <div className="hidden min-w-0 max-w-[18rem] text-right lg:block">
              <p className="truncate text-[1rem] font-bold text-[var(--text)]">
                {user?.full_name || "User"}
              </p>
              <p className="truncate text-[0.8rem] font-medium tracking-[0.04em] text-[var(--soft)]">
                {user?.email || ""}
              </p>
            </div>
            <div className="hidden h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[var(--glass-line)] bg-[var(--surface-high)] text-xs font-black lg:flex">
              {user?.full_name?.slice(0, 1).toUpperCase() ?? (
                <UserRound className="h-4 w-4" />
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1680px] pt-20">
        {/* {topTabs?.length ? (
          <div className="sticky top-20 z-30 border-b border-[var(--glass-line)] bg-[linear-gradient(180deg,rgba(var(--bg-rgb),0.96),rgba(var(--bg-rgb),0.9))] px-4 py-3 backdrop-blur-xl lg:hidden sm:px-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-label text-[10px] font-extrabold uppercase tracking-[0.24em] text-[var(--soft)]">
                Quick tabs
              </p>
              <span className="rounded-full bg-[rgba(var(--accent-rgb),0.12)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
                Mobile
              </span>
            </div>
            <div className="scrollbar-thin flex snap-x gap-2 overflow-x-auto pb-1">
              {topTabs.map((tab) =>
                tab.href && !tab.href.startsWith("#") ? (
                  <NavLink
                    className={({ isActive }) =>
                      cn(
                        "shrink-0 snap-start rounded-full border px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.2em] transition",
                        isActive || isTabActive(tab)
                          ? "border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)]"
                          : "border-[var(--line)] bg-[var(--surface-high)] text-[var(--muted)]",
                      )
                    }
                    key={`mobile-tab-${tab.label}-${tab.href}`}
                    to={tab.href}
                  >
                    {tab.label}
                  </NavLink>
                ) : (
                  <button
                    className={cn(
                      "shrink-0 snap-start rounded-full border px-4 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.2em] transition",
                      isTabActive(tab)
                        ? "border-[rgba(var(--accent-rgb),0.3)] bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)]"
                        : "border-[var(--line)] bg-[var(--surface-high)] text-[var(--muted)]",
                    )}
                    key={`mobile-tab-${tab.label}`}
                    onClick={() => handleTabSelection(tab)}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ),
              )}
            </div>
          </div>
        ) : null} */}

        <aside className="shell-sidebar fixed left-0 top-20 hidden h-[calc(100vh-5rem)] w-72 flex-col bg-[var(--surface-sidebar)] px-5 py-5 shadow-2xl shadow-[rgba(var(--shadow),0.2)] lg:flex">
          <div className="mb-8 px-4 pt-2">
            <p className="text-xl font-bold text-[var(--accent)]">
              Cogitation Works
            </p>
            <p className="font-label text-[11px] uppercase tracking-[0.24em] text-[var(--soft)]">
              Internal Workspace
            </p>
          </div>

          {sidebarAction ?? defaultSidebarAction}

          <nav className="space-y-2 font-display text-[0.98rem]">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3.5 transition",
                      isActive
                        ? "border-l-4 border-[var(--secondary)] bg-[var(--surface-strong)] text-[var(--accent)]"
                        : "text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)] hover:translate-x-1",
                    )
                  }
                  key={item.href}
                  to={item.href}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-[var(--glass-line)] pt-4">
            <button
              className="inline-flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-[0.98rem] font-medium text-[var(--muted)] transition hover:bg-[var(--surface-strong)] hover:text-[var(--text)]"
              onClick={() => void handleLogout()}
              type="button"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        <main className="command-page min-w-0 flex-1">
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className="command-header"
            initial={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
          >
            <p className="font-label text-[11px] font-extrabold uppercase tracking-[0.24em] text-[var(--accent)]">
              {eyebrow}
            </p>
            <div className="mt-4 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h1>{title}</h1>
                <p>{description}</p>
              </div>
              {actions ? (
                <div className="flex flex-wrap items-center gap-3 xl:justify-end">
                  {actions}
                </div>
              ) : null}
            </div>
          </motion.div>

          <motion.div
            animate={{ opacity: 1, y: 0 }}
            className={cn("dashboard-grid mt-6", aside && "with-aside")}
            initial={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.42, delay: 0.06, ease: "easeOut" }}
          >
            <div>{children}</div>
            {aside ? (
              <div className="space-y-6 xl:sticky xl:top-24 xl:self-start xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-2 scrollbar-thin">
                {aside}
              </div>
            ) : null}
          </motion.div>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4 lg:hidden">
        <div className="glass-panel flex w-full max-w-md items-center justify-between rounded-full px-2 py-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                className={({ isActive }) =>
                  cn(
                    "flex flex-1 flex-col items-center gap-1 rounded-full px-2 py-2.5 text-[10px] font-extrabold uppercase tracking-[0.18em]",
                    isActive
                      ? "bg-[rgba(var(--accent-rgb),0.14)] text-[var(--accent)]"
                      : "text-[var(--soft)]",
                  )
                }
                key={`mobile-${item.href}`}
                onClick={() => setMobileOpen(false)}
                to={item.href}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen ? (
          <div
            className="shell-mobile-overlay fixed inset-0 z-50 bg-[rgba(var(--bg-rgb),0.8)] backdrop-blur-md lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <motion.div
              animate={{ width: "18rem" }}
              className="shell-mobile-drawer h-full overflow-hidden bg-[var(--surface-sidebar)] p-5 shadow-2xl"
              exit={{ width: 0 }}
              initial={{ width: 0 }}
              onClick={(event) => event.stopPropagation()}
              transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="flex items-center justify-between">
                <Brand compact />
                <button
                  className="shell-mobile-close grid h-10 w-10 place-items-center rounded-lg border border-[var(--line)] bg-[var(--surface-high)]"
                  onClick={() => setMobileOpen(false)}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-8 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      className={({ isActive }) =>
                        cn(
                          "shell-mobile-nav-link flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition",
                          isActive
                            ? "border-l-4 border-[var(--secondary)] bg-[var(--surface-strong)] text-[var(--accent)]"
                            : "text-[var(--muted)] hover:bg-[var(--surface-strong)] hover:text-[var(--text)]",
                        )
                      }
                      key={`drawer-${item.href}`}
                      onClick={() => setMobileOpen(false)}
                      to={item.href}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>

              <div className="mt-6">
                {sidebarAction ?? defaultSidebarAction}
              </div>

              <button
                className="shell-mobile-logout mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-strong)] px-4 py-3 text-xs font-extrabold uppercase tracking-[0.18em] text-[var(--muted)]"
                onClick={() => void handleLogout()}
                type="button"
              >
                <LogOut className="h-4 w-4" />
                <span>Logout</span>
              </button>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      {dock ? (
        <div className="fixed bottom-6 left-1/2 z-30 hidden -translate-x-1/2 md:block">
          {dock}
        </div>
      ) : null}
    </div>
  );
}

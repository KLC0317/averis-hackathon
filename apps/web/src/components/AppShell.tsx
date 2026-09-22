"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart2, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck,
  FileInput, FileSearch, Inbox as InboxIcon, Layers, ListTodo, Loader2, Mail, Menu, Moon,
  Radio, Search, Settings, Sparkles,
  Sun, Type, X
} from "lucide-react";
import { useToast } from "./Toast";
import { ClearDraftBrand, ClearDraftLogo } from "./ClearDraftLogo";
import { apiClient, getCachedMetrics, setCachedMetrics, type Metrics } from "../api/client";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");
const PROFILE_KEY = "cleardraft-profile";

type ShellProfile = { name: string; role: string; photo: string };

function profileInitials(name: string) {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "OP";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const isCasePage = pathname?.startsWith("/cases/");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [profile, setProfile] = useState<ShellProfile>({ name: "Kian Lok", role: "Lead Operator", photo: "" });

  useEffect(() => {
    const loadProfile = () => {
      try {
        const saved = localStorage.getItem(PROFILE_KEY);
        if (saved) setProfile((current) => ({ ...current, ...JSON.parse(saved) }));
      } catch {
        // Keep the default shell profile when local preferences are unavailable.
      }
    };
    loadProfile();
    window.addEventListener("cleardraft-profile-updated", loadProfile);
    return () => window.removeEventListener("cleardraft-profile-updated", loadProfile);
  }, []);

  // Live genuine operations metrics for sidebar badges
  useEffect(() => {
    let cancelled = false;
    const cached = getCachedMetrics();
    if (cached) {
      setMetrics(cached);
    }
    apiClient.getMetrics()
      .then((m) => {
        if (!cancelled && m) {
          setMetrics(m);
          setCachedMetrics(m);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const alertCount = metrics?.funnel?.needs_human ?? metrics?.needsReview ?? null;
  const todoCount = metrics?.funnel?.operator_action ?? null;

  // Initialize theme from localStorage on client
  useEffect(() => {
    const isDark = localStorage.getItem("cleardraft-theme") === "dark";
    setDark(isDark);
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("cleardraft-theme", "dark");
      toast("Switched to Dark Mode", "info");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("cleardraft-theme", "light");
      toast("Switched to Light Mode", "info");
    }
  };

  // Keyboard shortcut for Cmd+K and Ctrl+B
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((v) => !v);
      }
      if (e.key === "Escape") {
        setCmdOpen(false);
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className={cx("app", dark && "dark", isCasePage && "app-case-mode")}>
      {/* Mobile Sidebar Hamburger Trigger (visible on screens <= 768px) */}
      {!isCasePage && (
        <button
          type="button"
          className="mobile-sidebar-toggle-btn"
          onClick={() => setSidebarOpen(true)}
          title="Open Navigation"
          aria-label="Open Navigation Menu"
        >
          <Menu size={18} />
        </button>
      )}

      {isCasePage ? (
        <header className="case-top-navbar">
          <div className="case-top-navbar-left">
            <Link href="/inbox" className="case-top-brand" aria-label="ClearDraft Home">
              <ClearDraftBrand height={28} showText={true} />
            </Link>
          </div>

          <div className="case-top-navbar-right">
            <button
              className="utility-btn"
              onClick={toggleDark}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <div className="case-top-user-pill">
              <span className="case-top-avatar">{profile.photo ? <img src={profile.photo} alt="" /> : profileInitials(profile.name)}</span>
              <span className="case-top-user-name">{profile.name}</span>
              <ChevronDown size={13} className="case-top-user-chevron" />
            </div>
          </div>
        </header>
      ) : (
      <aside className={cx("sidebar", collapsed && "sidebar-collapsed", sidebarOpen && "sidebar-mobile-open")}>
        <div className="sidebar-top-section">
          {/* Header with Extracted Official Logo & Chevron Collapse Toggle */}
          <div className="sidebar-header">
            {!collapsed ? (
              <>
                <Link
                  href="/inbox"
                  className="brand"
                  aria-label="ClearDraft Home"
                  onClick={() => setSidebarOpen(false)}
                >
                  <ClearDraftBrand height={34} showText={true} />
                </Link>
                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <button
                    type="button"
                    className="sidebar-chevron-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCollapsed(true);
                    }}
                    title="Collapse sidebar (Ctrl+B)"
                    aria-label="Collapse sidebar"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {sidebarOpen && (
                    <button
                      type="button"
                      className="sidebar-toggle-btn mobile-close-btn"
                      onClick={() => setSidebarOpen(false)}
                      title="Close drawer"
                      aria-label="Close drawer"
                    >
                      <X size={17} />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="sidebar-collapsed-header-wrap">
                <Link
                  href="/inbox"
                  className="brand-collapsed-link"
                  aria-label="ClearDraft Home"
                  onClick={() => setSidebarOpen(false)}
                  title="ClearDraft Home"
                >
                  <ClearDraftLogo size={28} />
                </Link>
                <button
                  type="button"
                  className="sidebar-chevron-btn collapsed"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCollapsed(false);
                  }}
                  title="Expand sidebar (Ctrl+B)"
                  aria-label="Expand sidebar"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>

          {/* Navigation Section 1: GENERAL */}
          <nav className="sidebar-nav" aria-label="Main Navigation">
            {!collapsed ? (
              <div className="nav-section-title">GENERAL</div>
            ) : (
              <div className="nav-section-divider" />
            )}

            <NavItem
              href="/inbox"
              icon={<InboxIcon size={17} />}
              label="Dashboard"
              badge={alertCount != null ? String(alertCount) : undefined}
              badgeTone="amber"
              collapsed={collapsed}
              onNavigate={() => setSidebarOpen(false)}
            />
            <NavItem
              href="/todo"
              icon={<CheckSquare size={17} />}
              label="To-do List"
              badge={todoCount != null ? String(todoCount) : undefined}
              badgeTone="teal"
              collapsed={collapsed}
              onNavigate={() => setSidebarOpen(false)}
            />
            <NavItem
              href="/imports"
              icon={<FileInput size={17} />}
              label="Imports"
              collapsed={collapsed}
              onNavigate={() => setSidebarOpen(false)}
            />
            <NavItem
              href="/live"
              icon={<Radio size={17} />}
              label="Live Mailbox"
              badge="IMAP"
              badgeTone="teal"
              collapsed={collapsed}
              onNavigate={() => setSidebarOpen(false)}
            />

            {/* Navigation Section 2: MY SPACES */}
            {!collapsed ? (
              <div className="nav-section-title" style={{ marginTop: "16px" }}>
                MY SPACES
              </div>
            ) : (
              <div className="nav-section-divider" />
            )}

            <NavItem
              href="/evaluation"
              icon={<BarChart2 size={17} />}
              label="Evaluation"
              collapsed={collapsed}
              onNavigate={() => setSidebarOpen(false)}
            />
            <NavItem
              href="/rl-audit"
              icon={<Sparkles size={17} />}
              label="RL Audit"
              badge="RLHF"
              badgeTone="purple"
              collapsed={collapsed}
              onNavigate={() => setSidebarOpen(false)}
            />
            <NavItem
              href="/settings"
              icon={<Settings size={17} />}
              label="Settings"
              collapsed={collapsed}
              onNavigate={() => setSidebarOpen(false)}
            />
          </nav>
        </div>

        {/* Bottom Profile Row with Dark Mode Toggle directly beside profile */}
        <div className="sidebar-footer">
          <div className={cx("sidebar-user-row", collapsed && "user-row-collapsed")}>
            <button
              type="button"
              className="sidebar-user-profile-btn"
              onClick={() => toast("Operator profile: Kian Lok · Role: Lead Verifier", "info")}
              title={`User Profile: ${profile.name}`}
              aria-label="Operator Profile"
            >
              <div className="avatar-ring-wrap">
                <span className="avatar">{profile.photo ? <img src={profile.photo} alt="" /> : profileInitials(profile.name)}</span>
                <span className="avatar-online-dot" />
              </div>
              {!collapsed && (
                <div className="user-details">
                  <strong>{profile.name}</strong>
                  <span>{profile.role}</span>
                </div>
              )}
              {collapsed && <span className="rail-tooltip">{profile.name}</span>}
            </button>

            {/* Dark Mode Button directly beside the profile */}
            <button
              type="button"
              className="sidebar-theme-btn"
              onClick={toggleDark}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
              {collapsed && <span className="rail-tooltip">{dark ? "Light Mode" : "Dark Mode"}</span>}
            </button>
          </div>
        </div>
      </aside>
      )}

      {sidebarOpen && !isCasePage && (
        <div className="modal-overlay mobile-only" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main Content Area without redundant topbar */}
      <main className={cx("main", isCasePage && "main-case-view")}>

        {/* Command Palette Modal */}
        {cmdOpen && (
          <div className="modal-overlay" onClick={() => setCmdOpen(false)}>
            <div className="command-modal" onClick={(e) => e.stopPropagation()}>
              <div className="command-search-head">
                <Search size={18} style={{ color: "var(--ink-muted)" }} />
                <input
                  autoFocus
                  placeholder="Jump to page, case ID, or search..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setCmdOpen(false);
                      router.push("/inbox");
                    }
                  }}
                />
                <button className="icon-btn" onClick={() => setCmdOpen(false)}>
                  <X size={16} />
                </button>
              </div>
              <div className="command-list">
                <div
                  className="command-item"
                  onClick={() => {
                    router.push("/inbox");
                    setCmdOpen(false);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <InboxIcon size={16} />
                    <span>Inbox (Verification Queue)</span>
                  </div>
                  <span className="mono" style={{ fontSize: "11px" }}>/inbox</span>
                </div>
                <div
                  className="command-item"
                  onClick={() => {
                    router.push("/todo");
                    setCmdOpen(false);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <CheckSquare size={16} />
                    <span>To-do List (Operator Tasks)</span>
                  </div>
                  <span className="mono" style={{ fontSize: "11px" }}>/todo</span>
                </div>
                <div
                  className="command-item"
                  onClick={() => {
                    router.push("/cases/case-1042");
                    setCmdOpen(false);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <FileSearch size={16} />
                    <span>Active Case: case-1042 (Pacific Trade / Harbor Retail)</span>
                  </div>
                  <span className="status-badge warning">Mismatch</span>
                </div>
                <div
                  className="command-item"
                  onClick={() => {
                    router.push("/imports");
                    setCmdOpen(false);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <FileInput size={16} />
                    <span>Imports (Participant Bundles)</span>
                  </div>
                  <span className="mono" style={{ fontSize: "11px" }}>/imports</span>
                </div>
                <div
                  className="command-item"
                  onClick={() => {
                    router.push("/live");
                    setCmdOpen(false);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Radio size={16} />
                    <span>Live Mailbox (Read-only IMAP Ingestion)</span>
                  </div>
                  <span className="mono" style={{ fontSize: "11px" }}>/live</span>
                </div>
                <div
                  className="command-item"
                  onClick={() => {
                    router.push("/challenges");
                    setCmdOpen(false);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Sparkles size={16} />
                    <span>Challenges (Regression Mutations)</span>
                  </div>
                  <span className="mono" style={{ fontSize: "11px" }}>/challenges</span>
                </div>
                <div
                  className="command-item"
                  onClick={() => {
                    router.push("/evaluation");
                    setCmdOpen(false);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <ClipboardCheck size={16} />
                    <span>Evaluation Report & Scores</span>
                  </div>
                  <span className="mono" style={{ fontSize: "11px" }}>/evaluation</span>
                </div>
                <div
                  className="command-item"
                  onClick={() => {
                    router.push("/rl-audit");
                    setCmdOpen(false);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Sparkles size={16} style={{ color: "#8b5cf6" }} />
                    <span>RL Audit & Precedent Memory</span>
                  </div>
                  <span className="mono" style={{ fontSize: "11px" }}>/rl-audit</span>
                </div>
                <div
                  className="command-item"
                  onClick={() => {
                    router.push("/settings");
                    setCmdOpen(false);
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Settings size={16} />
                    <span>Workspace Settings</span>
                  </div>
                  <span className="mono" style={{ fontSize: "11px" }}>/settings</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content Outlet */}
        <div className="page-content">
          {children}
        </div>
      </main>
    </div>
  );
}

function NavItem({
  href,
  icon,
  label,
  badge,
  badgeTone = "amber",
  collapsed,
  onNavigate
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  badgeTone?: "amber" | "teal" | "purple" | "neutral";
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = pathname === href || (href !== "/inbox" && pathname.startsWith(href));
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    setIsPending(false);
  }, [pathname]);

  return (
    <Link
      href={href}
      prefetch={true}
      onMouseEnter={() => {
        try {
          router.prefetch(href);
        } catch (_) {}
      }}
      onTouchStart={() => {
        try {
          router.prefetch(href);
        } catch (_) {}
      }}
      onClick={() => {
        if (pathname !== href) {
          setIsPending(true);
        }
        onNavigate?.();
      }}
      className={cx(
        "nav-item",
        isActive && "active",
        isPending && "nav-item-pending"
      )}
    >
      <span className="nav-icon">
        {isPending ? <Loader2 size={16} className="nav-pending-spinner" /> : icon}
      </span>
      {!collapsed ? (
        <>
          <span className="nav-label">{label}</span>
          {badge && <span className={cx("nav-pill-badge", `badge-${badgeTone}`)} suppressHydrationWarning>{badge}</span>}
        </>
      ) : (
        <span className="rail-tooltip" suppressHydrationWarning>
          {label} {badge ? `(${badge})` : ""}
        </span>
      )}
    </Link>
  );
}

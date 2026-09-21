"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity, BarChart2, CheckSquare, ChevronDown, ChevronRight, ClipboardCheck,
  FileInput, FileSearch, HelpCircle, Inbox as InboxIcon, Layers, Moon,
  MoreHorizontal, PanelLeftClose, PanelLeftOpen, Search, Settings, Sparkles,
  Sun, Type, X
} from "lucide-react";
import { useToast } from "./Toast";
import { ClearDraftBrand, ClearDraftLogo } from "./ClearDraftLogo";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dark, setDark] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);

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

  // Keyboard shortcut for Cmd+K
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
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className={cx("app", dark && "dark")}>
      {/* Precision Modern Sidebar (Matching Reference Design) */}
      <aside className={cx("sidebar", collapsed && "sidebar-collapsed", sidebarOpen && "sidebar-mobile-open")}>
        <div className="sidebar-top-section">
          {/* Header with Extracted Official Logo & Collapse Toggle */}
          <div className="sidebar-header">
            {!collapsed ? (
              <>
                <Link href="/inbox" className="brand" aria-label="ClearDraft Home">
                  <ClearDraftBrand height={34} showText={true} />
                </Link>
                <button
                  type="button"
                  className="sidebar-toggle-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCollapsed(true);
                  }}
                  title="Collapse sidebar (Ctrl+B)"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose size={17} />
                </button>
              </>
            ) : (
              <div className="sidebar-collapsed-header-wrap">
                <button
                  type="button"
                  className="sidebar-rail-header-btn"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setCollapsed(false);
                  }}
                  title="Expand sidebar (Ctrl+B)"
                  aria-label="Expand sidebar"
                >
                  <ClearDraftLogo size={30} />
                  <span className="rail-expand-pill">
                    <PanelLeftOpen size={11} />
                  </span>
                  <span className="rail-tooltip">Expand Sidebar (Ctrl+B)</span>
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
              badge="36"
              badgeTone="amber"
              collapsed={collapsed}
            />
            <NavItem
              href="/cases/case-1042"
              icon={<CheckSquare size={17} />}
              label="To-do List"
              badge="1"
              badgeTone="teal"
              collapsed={collapsed}
            />
            <NavItem
              href="/imports"
              icon={<FileInput size={17} />}
              label="Imports"
              collapsed={collapsed}
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
              href="/challenges"
              icon={<Sparkles size={17} />}
              label="Challenges"
              collapsed={collapsed}
            />
            <NavItem
              href="/evaluation"
              icon={<BarChart2 size={17} />}
              label="Evaluation"
              badge="98.6%"
              badgeTone="purple"
              collapsed={collapsed}
            />
            <NavItem
              href="/typography"
              icon={<Type size={17} />}
              label="Typography"
              badge="System"
              badgeTone="teal"
              collapsed={collapsed}
            />

            {/* Workspace item with popup */}
            <div style={{ position: "relative" }}>
              <button
                className={cx("nav-item", orgOpen && "active")}
                onClick={() => setOrgOpen((v) => !v)}
                title={collapsed ? "Workspace: Averis SDOC" : "Switch Workspace"}
                style={{ width: "100%" }}
              >
                <span className="nav-icon"><Layers size={17} /></span>
                {!collapsed ? (
                  <>
                    <span className="nav-label">Averis SDOC</span>
                    <ChevronDown size={13} style={{ marginLeft: "auto", opacity: 0.6 }} />
                  </>
                ) : (
                  <span className="rail-tooltip">Workspace: Averis SDOC</span>
                )}
              </button>

              {orgOpen && (
                <div
                  className="card"
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    left: 0,
                    right: collapsed ? "auto" : 0,
                    width: collapsed ? "220px" : "100%",
                    zIndex: 60,
                    padding: "8px",
                    marginBottom: "6px",
                    boxShadow: "var(--shadow-xl)"
                  }}
                >
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--ink-faint)", padding: "4px 8px", textTransform: "uppercase" }}>
                    Select Workspace
                  </div>
                  {[
                    { name: "Averis SDOC 2024", active: true, tag: "Primary" },
                    { name: "Participant Fixtures", active: false, tag: "Mock" },
                    { name: "Regression Suite", active: false, tag: "QA" }
                  ].map((ws, i) => (
                    <button
                      key={i}
                      className={cx("nav-item", ws.active && "active")}
                      style={{ padding: "6px 8px", fontSize: "12px", width: "100%" }}
                      onClick={() => {
                        setOrgOpen(false);
                        toast(`Switched workspace to: ${ws.name}`, "info");
                      }}
                    >
                      <span style={{ fontWeight: ws.active ? 700 : 500 }}>{ws.name}</span>
                      <span className="brand-badge" style={{ marginLeft: "auto" }}>{ws.tag}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <NavItem
              href="/settings"
              icon={<Settings size={17} />}
              label="Settings"
              collapsed={collapsed}
            />
          </nav>
        </div>

        {/* Bottom Utility Row & Profile (matching reference image) */}
        <div className="sidebar-footer">
          {/* 4-button circular utility action row */}
          <div className={cx("sidebar-utility-row", collapsed && "utility-row-vertical")}>
            <button
              className="utility-btn"
              onClick={() => toast("ClearDraft Documentation: docs.cleardraft.io", "info")}
              title="Help & Guidelines"
              aria-label="Help"
            >
              <HelpCircle size={16} />
              {collapsed && <span className="rail-tooltip">Help & Docs</span>}
            </button>

            <button
              className="utility-btn"
              onClick={toggleDark}
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle theme"
            >
              {dark ? <Sun size={16} /> : <Moon size={16} />}
              {collapsed && <span className="rail-tooltip">{dark ? "Light Mode" : "Dark Mode"}</span>}
            </button>

            <button
              className="utility-btn"
              onClick={() => toast("Deterministic Engine: rules-v0.3 operational · 14ms latency", "success")}
              title="Engine Diagnostics"
              aria-label="Diagnostics"
            >
              <Activity size={16} />
              {collapsed && <span className="rail-tooltip">Engine Diagnostics</span>}
            </button>

            <button
              type="button"
              className="utility-btn"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setCollapsed(!collapsed);
              }}
              title={collapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
              aria-label="Toggle collapse"
            >
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              {collapsed && <span className="rail-tooltip">Expand Sidebar (Ctrl+B)</span>}
            </button>
          </div>

          <div className="sidebar-divider" />

          {/* Operator Profile Card */}
          <button
            className={cx("sidebar-user-card", collapsed && "user-card-collapsed")}
            onClick={() => toast("Operator profile: Kian Lee · Role: Lead Verifier", "info")}
            title="User Profile"
          >
            <div className="avatar-ring-wrap">
              <span className="avatar">KL</span>
              <span className="avatar-online-dot" />
            </div>
            {!collapsed && (
              <>
                <div className="user-details">
                  <strong>Kian Lee</strong>
                  <span>Lead Operator</span>
                </div>
                <MoreHorizontal size={15} className="user-more" style={{ marginLeft: "auto", color: "var(--ink-faint)" }} />
              </>
            )}
            {collapsed && <span className="rail-tooltip">Kian Lee (Lead)</span>}
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="modal-overlay mobile-only" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main Content Area without redundant topbar */}
      <main className="main">
        {collapsed && (
          <button
            type="button"
            className="collapsed-main-expand-btn"
            onClick={() => setCollapsed(false)}
            title="Expand sidebar (Ctrl+B)"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen size={15} />
            <span>Expand Sidebar</span>
          </button>
        )}

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
  collapsed
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  badgeTone?: "amber" | "teal" | "purple" | "neutral";
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/inbox" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={cx("nav-item", isActive && "active")}
    >
      <span className="nav-icon">{icon}</span>
      {!collapsed ? (
        <>
          <span className="nav-label">{label}</span>
          {badge && <span className={cx("nav-pill-badge", `badge-${badgeTone}`)}>{badge}</span>}
        </>
      ) : (
        <span className="rail-tooltip">
          {label} {badge ? `(${badge})` : ""}
        </span>
      )}
    </Link>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { Check, CircleHelp, Database, RefreshCw, Server, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { useToast } from "../../components/Toast";
import { Button, PageHeader, StatusBadge } from "../../components/UI";
import { apiClient, type ReadinessStatus } from "../../api/client";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

type ServiceState = "checking" | "ready" | "unavailable";

function serviceIcon(state: ServiceState) {
  if (state === "checking") return <RefreshCw size={14} className="spin" />;
  if (state === "ready") return <Check size={14} className="success-text" />;
  return <XCircle size={14} className="danger-text" />;
}

function serviceLabel(state: ServiceState) {
  if (state === "checking") return "Checking";
  if (state === "ready") return "Ready";
  return "Unavailable";
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<"rules" | "live">("rules");
  const [keepBytes, setKeepBytes] = useState(true);
  const [traceLogs, setTraceLogs] = useState(true);
  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("cleardraft-settings");
      if (saved) {
        const parsed = JSON.parse(saved) as { mode?: "rules" | "live"; keepBytes?: boolean; traceLogs?: boolean };
        if (parsed.mode) setMode(parsed.mode);
        if (typeof parsed.keepBytes === "boolean") setKeepBytes(parsed.keepBytes);
        if (typeof parsed.traceLogs === "boolean") setTraceLogs(parsed.traceLogs);
      }
    } catch {
      // Defaults remain truthful if local preferences are unavailable.
    }
  }, []);

  const checkReadiness = () => {
    setChecking(true);
    apiClient
      .getReadiness()
      .then((status) => {
        setReadiness(status);
        setLastChecked(status.checkedAt);
        toast(status.ready ? "API readiness confirmed" : "API responded but is not ready", status.ready ? "success" : "warning");
      })
      .catch(() => {
        const status: ReadinessStatus = { ready: false, database: false, error: "unreachable", checkedAt: new Date().toISOString() };
        setReadiness(status);
        setLastChecked(status.checkedAt);
        toast("API readiness check failed · backend is unreachable", "warning");
      })
      .finally(() => setChecking(false));
  };

  useEffect(() => {
    checkReadiness();
  }, []);

  const savePreferences = () => {
    localStorage.setItem("cleardraft-settings", JSON.stringify({ mode, keepBytes, traceLogs }));
    toast("Workspace preferences saved locally", "success");
  };

  const backendState: ServiceState = checking ? "checking" : readiness?.ready ? "ready" : "unavailable";
  const databaseState: ServiceState = checking ? "checking" : readiness?.database ? "ready" : "unavailable";

  return (
    <div className="content-wrap">
      <PageHeader
        eyebrow="WORKSPACE CONFIGURATION"
        title="Settings"
        description="Manage local execution preferences and inspect the API readiness state. Settings never claim a worker or evaluator is connected unless an endpoint confirms it."
        actions={<Button variant="primary" icon={<Check size={15} />} onClick={savePreferences}>Save changes</Button>}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <div className="card">
          <div className="card-heading">
            <div><span className="eyebrow" style={{ fontSize: "10px" }}>PIPELINE ENGINE</span><h3>Processing Mode</h3></div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
            <button className={cx("card", mode === "rules" && "selected")} style={{ padding: "14px", cursor: "pointer", textAlign: "left", border: mode === "rules" ? "2px solid var(--primary)" : "1px solid var(--border-default)", background: mode === "rules" ? "var(--primary-subtle)" : "var(--bg-surface)" }} onClick={() => setMode("rules")}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}><strong>Local rules + recorded replay</strong><span className="status-badge success">Recommended</span></div>
              <p style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px" }}>Deterministic extraction for clean machine test runs. No external network transmission.</p>
            </button>
            <button className={cx("card", mode === "live" && "selected")} style={{ padding: "14px", cursor: "pointer", textAlign: "left", border: mode === "live" ? "2px solid var(--primary)" : "1px solid var(--border-default)", background: mode === "live" ? "var(--primary-subtle)" : "var(--bg-surface)" }} onClick={() => setMode("live")}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}><strong>Live AI provider adapter</strong><span className="status-badge warning">Optional</span></div>
              <p style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px" }}>Only use when the backend is configured for a live provider. This preference does not make one available.</p>
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-heading">
            <div><span className="eyebrow" style={{ fontSize: "10px" }}>READINESS CHECKS</span><h3>System Status</h3></div>
            <span className={cx("status-badge", backendState === "ready" ? "success" : backendState === "checking" ? "info" : "danger")}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{serviceIcon(backendState)} {serviceLabel(backendState)}</span></span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", gap: "9px", alignItems: "flex-start" }}><Server size={16} style={{ color: "var(--primary)", marginTop: 2 }} /><div><strong style={{ fontSize: "13px" }}>FastAPI backend</strong><p style={{ fontSize: "11px", color: "var(--ink-muted)" }}>{readiness ? (readiness.ready ? "Readiness endpoint confirmed" : `Not ready${readiness.error ? ` · ${readiness.error}` : ""}`) : "Not checked"}</p></div></div>
              <span className={cx("status-badge", backendState === "ready" ? "success" : backendState === "checking" ? "info" : "danger")}>{serviceLabel(backendState)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-subtle)" }}>
              <div style={{ display: "flex", gap: "9px", alignItems: "flex-start" }}><Database size={16} style={{ color: "var(--primary)", marginTop: 2 }} /><div><strong style={{ fontSize: "13px" }}>SQLite database</strong><p style={{ fontSize: "11px", color: "var(--ink-muted)" }}>{readiness?.database ? "Database query succeeded" : "No confirmed database connection"}</p></div></div>
              <span className={cx("status-badge", databaseState === "ready" ? "success" : databaseState === "checking" ? "info" : "danger")}>{serviceLabel(databaseState)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
              <div style={{ display: "flex", gap: "9px", alignItems: "flex-start" }}><CircleHelp size={16} style={{ color: "var(--ink-faint)", marginTop: 2 }} /><div><strong style={{ fontSize: "13px" }}>Organizer evaluator</strong><p style={{ fontSize: "11px", color: "var(--ink-muted)" }}>Isolated from this app; check Evaluation after external submission.</p></div></div>
              <span className="status-badge muted">Not checked</span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px" }}>
            <span style={{ fontSize: "11px", color: "var(--ink-faint)" }}>{lastChecked ? `Last checked ${new Date(lastChecked).toLocaleTimeString()}` : "No readiness check yet"}</span>
            <button className="text-btn" onClick={checkReadiness} disabled={checking}><RefreshCw size={12} className={checking ? "spin" : undefined} /> {checking ? "Checking…" : "Check readiness"}</button>
          </div>
        </div>

        <div className="card" style={{ gridColumn: "span 2" }}>
          <div className="card-heading"><div><span className="eyebrow" style={{ fontSize: "10px" }}>SECURITY &amp; RETENTION</span><h3>Local Data Handling</h3></div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", gap: "10px" }}><ShieldCheck size={17} className="success-text" /><div><strong>Keep immutable source bytes</strong><p style={{ fontSize: "12px", color: "var(--ink-muted)" }}>Store raw bytes in local storage root for cryptographically verifiable provenance.</p></div></div><button className={cx("switch-control", keepBytes && "on")} onClick={() => setKeepBytes((value) => !value)} aria-label="Toggle keep source bytes"><span className="switch-thumb" /></button></div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-subtle)", paddingTop: "14px" }}><div style={{ display: "flex", gap: "10px" }}><TriangleAlert size={17} className="warning-text" /><div><strong>Protected trace logging</strong><p style={{ fontSize: "12px", color: "var(--ink-muted)" }}>Retain structured parser and model diagnostic traces for 7 days.</p></div></div><button className={cx("switch-control", traceLogs && "on")} onClick={() => setTraceLogs((value) => !value)} aria-label="Toggle trace logging"><span className="switch-thumb" /></button></div>
          </div>
        </div>
      </div>
    </div>
  );
}

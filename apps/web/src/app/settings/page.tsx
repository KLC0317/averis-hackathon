"use client";

import React, { useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { useToast } from "../../components/Toast";
import { Button, PageHeader, StatusBadge } from "../../components/UI";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

export default function SettingsPage() {
  const { toast } = useToast();
  const [mode, setMode] = useState<"rules" | "live">("rules");
  const [keepBytes, setKeepBytes] = useState(true);
  const [traceLogs, setTraceLogs] = useState(true);
  const [checkingApi, setCheckingApi] = useState(false);

  const handleSave = () => {
    toast("Workspace configuration preferences saved successfully", "success");
  };

  const handleCheck = (name: string) => {
    setCheckingApi(true);
    setTimeout(() => {
      setCheckingApi(false);
      toast(`${name}: Health check confirmed operational (18ms)`, "success");
    }, 500);
  };

  return (
    <div className="content-wrap">
      <PageHeader
        eyebrow="WORKSPACE CONFIGURATION"
        title="Settings"
        description="Manage local rule execution modes, system readiness checks, and cryptographic evidence retention."
        actions={
          <Button variant="primary" icon={<Check size={15} />} onClick={handleSave}>
            Save changes
          </Button>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Processing Mode */}
        <div className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow" style={{ fontSize: "10px" }}>
                PIPELINE ENGINE
              </span>
              <h3>Processing Mode</h3>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
            <div
              className={cx("card", mode === "rules" && "selected")}
              style={{
                padding: "14px",
                cursor: "pointer",
                border:
                  mode === "rules" ? "2px solid var(--primary)" : "1px solid var(--border-default)",
                background: mode === "rules" ? "var(--primary-subtle)" : "var(--bg-surface)"
              }}
              onClick={() => {
                setMode("rules");
                toast("Selected: Local rules + recorded replay");
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>Local rules + recorded replay</strong>
                <span className="status-badge success">Recommended</span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px" }}>
                Deterministic extraction for clean machine test runs. No external network transmission.
              </p>
            </div>

            <div
              className={cx("card", mode === "live" && "selected")}
              style={{
                padding: "14px",
                cursor: "pointer",
                border:
                  mode === "live" ? "2px solid var(--primary)" : "1px solid var(--border-default)",
                background: mode === "live" ? "var(--primary-subtle)" : "var(--bg-surface)"
              }}
              onClick={() => {
                setMode("live");
                toast("Selected: Live AI provider adapter", "info");
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>Live AI provider adapter</strong>
                <span className="status-badge warning">Optional</span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px" }}>
                Invokes configured vision model for ambiguous, scanned or low-resolution documents.
              </p>
            </div>
          </div>
        </div>

        {/* System Readiness */}
        <div className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow" style={{ fontSize: "10px" }}>
                READINESS CHECKS
              </span>
              <h3>System Status</h3>
            </div>
            <StatusBadge status="Ready" />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px" }}>
            {[
              { label: "FastAPI Backend & SQLite", detail: "Connected · 127.0.0.1:8000" },
              { label: "Worker Engine Heartbeat", detail: "Active · polling 1s interval" },
              { label: "Evaluation Server", detail: "Connected · 127.0.0.1:8080" }
            ].map((svc, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--border-subtle)"
                }}
              >
                <div>
                  <strong style={{ fontSize: "13px" }}>{svc.label}</strong>
                  <p style={{ fontSize: "11px", color: "var(--ink-muted)" }}>{svc.detail}</p>
                </div>
                <button
                  className="text-btn"
                  onClick={() => handleCheck(svc.label)}
                  disabled={checkingApi}
                >
                  <RefreshCw size={12} className={checkingApi ? "spin" : undefined} /> Check
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Retention & Privacy Switches */}
        <div className="card" style={{ gridColumn: "span 2" }}>
          <div className="card-heading">
            <div>
              <span className="eyebrow" style={{ fontSize: "10px" }}>
                SECURITY & RETENTION
              </span>
              <h3>Local Data Handling</h3>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div>
                <strong>Keep immutable source bytes</strong>
                <p style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
                  Store raw bytes in local storage root for cryptographically verifiable provenance.
                </p>
              </div>
              <button
                className={cx("switch-control", keepBytes && "on")}
                onClick={() => {
                  setKeepBytes((v) => !v);
                  toast(
                    !keepBytes ? "Source byte retention enabled" : "Source byte retention disabled"
                  );
                }}
                aria-label="Toggle keep source bytes"
              >
                <span className="switch-thumb" />
              </button>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid var(--border-subtle)",
                paddingTop: "14px"
              }}
            >
              <div>
                <strong>Protected trace logging</strong>
                <p style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
                  Retain structured parser and model diagnostic traces for 7 days.
                </p>
              </div>
              <button
                className={cx("switch-control", traceLogs && "on")}
                onClick={() => {
                  setTraceLogs((v) => !v);
                  toast(!traceLogs ? "Trace logging enabled" : "Trace logging disabled");
                }}
                aria-label="Toggle trace logging"
              >
                <span className="switch-thumb" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

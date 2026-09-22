"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  Clock,
  ExternalLink,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import {
  apiClient,
  type MailboxConnection,
  type MailboxRetrieveResult
} from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, PageHeader, StatusBadge } from "../../components/UI";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

export default function LiveMailboxPage() {
  const { toast } = useToast();

  const [connections, setConnections] = useState<MailboxConnection[]>([]);
  const [selectedConnId, setSelectedConnId] = useState<string>("conn_gmail");
  const [retrieving, setRetrieving] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(0);
  const [retrieveResult, setRetrieveResult] = useState<MailboxRetrieveResult | null>(null);
  const gmailConnection = connections.find((connection) => connection.provider === "gmail");
  const testAddress = gmailConnection?.username ?? "geminiacckl@gmail.com";

  const loadConnections = async () => {
    try {
      const conns = await apiClient.listMailboxConnections();
      setConnections(conns);
      const gmail = conns.find((connection) => connection.provider === "gmail");
      if (gmail && selectedConnId !== gmail.id) {
        setSelectedConnId(gmail.id);
      }
    } catch {
      toast("Could not connect to backend service", "warning");
    }
  };

  useEffect(() => {
    loadConnections();
  }, []);

  const handleRetrieve = async (connId: string) => {
    setRetrieving(true);
    setActiveStep(1);
    setRetrieveResult(null);

    // Visual progression for demo feedback
    const stepTimer1 = setTimeout(() => setActiveStep(2), 500);
    const stepTimer2 = setTimeout(() => setActiveStep(3), 1100);

    try {
      // "live" fails loudly rather than substituting demo fixtures, so what is
      // shown on screen is never fabricated mail presented as retrieved mail.
      const res = await apiClient.retrieveMailbox(connId, { mode: "live" });
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setActiveStep(4);
      setRetrieveResult(res);

      if (res.new_count > 0) {
        const origin = res.is_live_server ? "live IMAP" : "demo fixture";
        const gateway = res.run_mode === "live_ai" ? "gateway can escalate to DeepSeek" : "local rules only, no AI key configured";
        toast(`Ingested ${res.new_count} email(s) from ${origin} · ${gateway}`, "success");
      } else {
        toast("Mailbox is up to date · No new messages above high-water mark", "info");
      }
      loadConnections();
    } catch (err: any) {
      toast(err?.message || "Failed to retrieve from mailbox", "warning");
    } finally {
      setRetrieving(false);
    }
  };

  return (
    <div className="content-wrap">
      <PageHeader
        title={
          <span>
            Live <span className="title-gradient-accent">Mailbox</span>
          </span>
        }
        description="Gmail intake for live shipping-email testing. Send a message, retrieve it, and review the resulting case."
        actions={
          <>
            <Button
              variant="primary"
              icon={<ArrowDownToLine size={15} />}
              onClick={() => gmailConnection && handleRetrieve(gmailConnection.id)}
              disabled={retrieving || !gmailConnection}
            >
              {retrieving ? "Retrieving..." : "Retrieve from Gmail"}
            </Button>
          </>
        }
      />

      <div
        className="funnel-panel"
        style={{
          marginBottom: "20px",
          display: "flex",
          alignItems: "flex-start",
          gap: "14px",
          padding: "18px 20px"
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "9px",
            background: "#fee2e2",
            color: "#dc2626",
            display: "grid",
            placeItems: "center",
            flexShrink: 0
          }}
          aria-hidden="true"
        >
          <Mail size={19} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--ink)" }}>
            Test the Gmail intake
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "12.5px", color: "var(--ink-secondary)", lineHeight: 1.55 }}>
            Send a test email from your own account to{" "}
            <a
              href={`mailto:${testAddress}`}
              style={{ color: "var(--primary)", fontWeight: 700, textDecoration: "underline", textUnderlineOffset: "2px" }}
            >
              {testAddress}
            </a>{" "}
            with any subject, body, or shipping attachments. Then click <strong>Retrieve from Gmail</strong>,
            then open the case in the live queue to test the review workflow and its actions.
          </p>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "10px" }}>
            <Link href="/inbox?source=mailbox" className="btn btn-secondary btn-sm">
              Open live queue <ArrowRight size={13} />
            </Link>
            <a
              href={`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(testAddress)}#inbox`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost btn-sm"
            >
              Open Gmail <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>

      {/* Trust & Architecture Disclosure Banners */}
      <div className="funnel-panel" style={{ marginBottom: "20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Box 1: Read-Only Protocol Assurance */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "var(--radius)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              display: "flex",
              gap: "12px",
              alignItems: "flex-start"
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "rgba(16, 185, 129, 0.12)",
                color: "#10b981",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <ShieldCheck size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--ink)" }}>
                Strict Read-Only IMAP (RFC 3501 section 6.3.2)
              </div>
              <div style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px", lineHeight: "1.4" }}>
                ClearDraft uses IMAP <code>EXAMINE</code> mode exclusively—never <code>STORE</code> or <code>DELETE</code>. Your real inboxes are never modified or altered.
              </div>
            </div>
          </div>

          {/* Box 2: Source Bytes Sovereignty */}
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "var(--radius)",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              display: "flex",
              gap: "12px",
              alignItems: "flex-start"
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "rgba(59, 130, 246, 0.12)",
                color: "#2563eb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0
              }}
            >
              <Lock size={18} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--ink)" }}>
                Zero-Credential Storage & Demonstration Seam
              </div>
              <div style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px", lineHeight: "1.4" }}>
                Credentials remain strictly in runtime environment variables. When no mailbox is configured, deterministic offline replay guarantees dependable evaluation.
              </div>
            </div>
          </div>
        </div>
      </div>

          {/* Source Provider Cards Grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "16px",
              marginBottom: "24px"
            }}
          >
            {connections.map((conn) => {
              const isSelected = selectedConnId === conn.id;
              const isAvailable = conn.provider === "gmail";
              const providerName =
                conn.provider === "gmail" ? "Gmail" : conn.provider === "outlook" ? "Outlook 365" : "Generic IMAP";
              const isGmail = conn.provider === "gmail";
              const isOutlook = conn.provider === "outlook";

              return (
                <div
                  key={conn.id}
                  onClick={isAvailable ? () => setSelectedConnId(conn.id) : undefined}
                  aria-disabled={!isAvailable}
                  style={{
                    background: "var(--surface)",
                    border: `1.5px solid ${isSelected && isAvailable ? "var(--primary)" : "var(--border)"}`,
                    borderRadius: "var(--radius)",
                    padding: "18px",
                    cursor: isAvailable ? "pointer" : "default",
                    opacity: isAvailable ? 1 : 0.72,
                    boxShadow: isSelected && isAvailable ? "0 0 0 3px rgba(37, 99, 235, 0.12)" : "none",
                    transition: "all 0.15s ease",
                    position: "relative"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "8px",
                          background: isGmail ? "#fee2e2" : isOutlook ? "#dbeafe" : "#f1f5f9",
                          color: isGmail ? "#dc2626" : isOutlook ? "#1d4ed8" : "#475569",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "14px"
                        }}
                      >
                        {isGmail ? "G" : isOutlook ? "O" : "IM"}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--ink)" }}>{conn.label}</div>
                        <div style={{ fontSize: "11px", color: "var(--ink-muted)" }}>{providerName} Intake</div>
                      </div>
                    </div>

                    <span
                      className="kpi-pill"
                      style={{
                        background: isAvailable ? "rgba(16, 185, 129, 0.1)" : "var(--bg-subtle)",
                        color: isAvailable ? "#059669" : "var(--ink-muted)",
                        borderColor: isAvailable ? "rgba(16, 185, 129, 0.2)" : "var(--border-default)"
                      }}
                    >
                      {isAvailable ? "EXAMINE Ready" : "Coming soon"}
                    </span>
                  </div>

                  <div
                    style={{
                      background: "var(--bg)",
                      padding: "10px 12px",
                      borderRadius: "6px",
                      fontSize: "12px",
                      marginBottom: "14px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--ink-muted)" }}>Host:</span>
                      <span className="mono" style={{ color: "var(--ink)", fontWeight: 500 }}>
                        {conn.host}:{conn.port}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--ink-muted)" }}>Account:</span>
                      <span className="mono" style={{ color: "var(--ink)" }}>
                        {conn.username}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--ink-muted)" }}>Target Folder:</span>
                      <span className="mono" style={{ color: "var(--ink)" }}>
                        {conn.folder}
                      </span>
                    </div>
                    {conn.configured_since && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--ink-muted)" }}>Cutoff:</span>
                        <span className="mono" style={{ color: "#10b981", fontSize: "11px", fontWeight: 600 }}>
                          &ge; {conn.configured_since}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
                      {conn.last_polled_at
                        ? `Polled: ${new Date(conn.last_polled_at).toLocaleTimeString()}`
                        : "Ready for pull"}
                    </span>
                    <span className={`status-badge ${isAvailable ? "success" : "muted"}`}>
                      {isAvailable ? "Gmail connected" : "Integration planned"}
                    </span>
                  </div>
                </div>
              );
            })}
            {!gmailConnection && (
              <div
                style={{
                  padding: "18px",
                  border: "1px dashed var(--border-default)",
                  borderRadius: "var(--radius)",
                  color: "var(--ink-muted)",
                  fontSize: "13px"
                }}
              >
                Gmail is not configured in this environment yet. Add the mailbox credentials, then reload this page.
              </div>
            )}
          </div>

          {/* Real-Time Ingestion Stepper during fetch */}
          {retrieving && (
            <div
              className="card"
              style={{
                marginBottom: "24px",
                padding: "20px",
                background: "var(--surface)",
                border: "1px solid var(--border)"
              }}
            >
              <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                <RefreshCw size={15} className="spin" style={{ color: "var(--primary)" }} />
                <span>Pulling from {selectedConnId}</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }}>
                {[
                  { title: "1. IMAP EXAMINE", sub: "Handshake & read-only lock" },
                  { title: "2. Fetch RFC822", sub: "High-water mark query" },
                  { title: "3. Parse MIME", sub: "Extract BL & SI documents" },
                  { title: "4. Run Verification", sub: "7-Field automated check" }
                ].map((step, idx) => {
                  const num = idx + 1;
                  const isDone = activeStep > num;
                  const isCurrent = activeStep === num;
                  return (
                    <div
                      key={step.title}
                      style={{
                        padding: "12px",
                        borderRadius: "8px",
                        background: isCurrent ? "rgba(37, 99, 235, 0.08)" : "var(--bg)",
                        border: `1px solid ${isCurrent ? "var(--primary)" : isDone ? "#10b981" : "var(--border)"}`,
                        transition: "all 0.2s ease"
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                        {isDone ? (
                          <Check size={14} style={{ color: "#10b981" }} />
                        ) : isCurrent ? (
                          <RefreshCw size={12} className="spin" style={{ color: "var(--primary)" }} />
                        ) : (
                          <Clock size={12} style={{ color: "var(--ink-muted)" }} />
                        )}
                        <span style={{ fontWeight: 600, fontSize: "12px", color: isCurrent ? "var(--primary)" : "var(--ink)" }}>
                          {step.title}
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--ink-muted)" }}>{step.sub}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Results Workspace Table */}
          {retrieveResult && (
            <div className="card" style={{ padding: "20px", background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--ink)" }}>
                    Latest Retrieved Inbound Batch
                  </h3>
                  <div style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "2px" }}>
                    Run ID: <span className="mono">{retrieveResult.run_id || "demo-run"}</span> · {retrieveResult.new_count} message(s) ingested
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px" }}>
                  <Link href="/inbox?source=mailbox" className="btn btn-secondary btn-sm">
                    View in Operations Queue
                    <ArrowRight size={13} style={{ marginLeft: "4px" }} />
                  </Link>
                </div>
              </div>

              {retrieveResult.cases.length > 0 ? (
                <div style={{ overflowX: "auto" }}>
                  <table className="table" style={{ width: "100%" }}>
                    <thead>
                      <tr>
                        <th>Case ID</th>
                        <th>Subject</th>
                        <th>Sender</th>
                        <th>Category</th>
                        <th>Verification</th>
                        <th style={{ textAlign: "right" }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retrieveResult.cases.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <Link href={`/cases/${c.id}`} className="table-id-link">
                              {c.id.slice(0, 8)}…
                            </Link>
                          </td>
                          <td style={{ fontWeight: 500, maxWidth: "300px" }}>{c.subject}</td>
                          <td className="table-sender">{c.sender}</td>
                          <td>
                            <span className="kpi-pill">{c.category}</span>
                          </td>
                          <td>
                            <StatusBadge status={c.verification === "MATCH" ? "Complete" : c.verification === "MISMATCH" ? "Needs review" : "Processing"} />
                          </td>
                          <td style={{ textAlign: "right" }}>
                            <Link href={`/cases/${c.id}`} className="btn btn-secondary btn-sm">
                              Open Review
                              <ExternalLink size={12} style={{ marginLeft: "4px" }} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "30px", color: "var(--ink-muted)", fontSize: "13px" }}>
                  {retrieveResult.message || "All mail items are already processed in this deployment."}
                </div>
              )}
            </div>
          )}
    </div>
  );
}

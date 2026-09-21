"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  Flame,
  Globe,
  HelpCircle,
  Inbox,
  Layers,
  Lock,
  Mail,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap
} from "lucide-react";
import {
  apiClient,
  type MailboxConnection,
  type MailboxStatus,
  type MailboxRetrieveResult,
  type CorrectionCandidate,
  type PromptExampleSet
} from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, PageHeader, StatusBadge } from "../../components/UI";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

export default function LiveMailboxPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [connections, setConnections] = useState<MailboxConnection[]>([]);
  const [selectedConnId, setSelectedConnId] = useState<string>("conn_gmail");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [retrieving, setRetrieving] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(0);
  const [retrieveResult, setRetrieveResult] = useState<MailboxRetrieveResult | null>(null);
  // Defaults to live: during a demo, silently showing fixtures as if they were
  // retrieved mail is far worse than an explicit connection error.
  const [retrieveMode, setRetrieveMode] = useState<"live" | "demo">("live");

  // Feature A curation tab state
  const [activeTab, setActiveTab] = useState<"sources" | "curation">("sources");
  const [candidates, setCandidates] = useState<CorrectionCandidate[]>([]);
  const [exampleSets, setExampleSets] = useState<PromptExampleSet[]>([]);
  const [promoting, setPromoting] = useState(false);

  const loadConnections = async () => {
    try {
      setRefreshing(true);
      const conns = await apiClient.listMailboxConnections();
      setConnections(conns);
      if (conns.length > 0 && !conns.some((c) => c.id === selectedConnId)) {
        setSelectedConnId(conns[0].id);
      }
    } catch {
      toast("Could not connect to backend service", "warning");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadCurationData = async () => {
    try {
      const [cands, sets] = await Promise.all([
        apiClient.listCorrectionCandidates(),
        apiClient.listPromptExampleSets()
      ]);
      setCandidates(cands);
      setExampleSets(sets);
    } catch {
      // Ignore background load error
    }
  };

  useEffect(() => {
    loadConnections();
    loadCurationData();
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
      const res = await apiClient.retrieveMailbox(connId, { mode: retrieveMode });
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

  const handleResetCursor = async (connId: string) => {
    try {
      const res = await apiClient.resetMailboxCursor(connId);
      toast(`Cursor rewound from UID ${res.previous_last_uid} to 0 · mail can be re-ingested`, "success");
      setRetrieveResult(null);
      setActiveStep(0);
      loadConnections();
    } catch (err: any) {
      toast(err?.message || "Failed to reset cursor", "warning");
    }
  };

  const handlePromoteBatch = async () => {
    const unpromoted = candidates.filter((c) => !c.is_promoted);
    if (unpromoted.length === 0) {
      toast("No unpromoted corrections available in the queue", "info");
      return;
    }

    setPromoting(true);
    try {
      const nextVersionNum = exampleSets.length + 1;
      const versionStr = `examples-v${nextVersionNum}`;
      const newSet = await apiClient.createPromptExampleSet({
        version: versionStr,
        examples: unpromoted.map((c) => ({
          subject: c.subject,
          category: c.new_category,
          rationale: c.rationale,
          body_excerpt: c.body_excerpt
        })),
        source_event_ids: unpromoted.map((c) => c.id),
        notes: `Curated batch of ${unpromoted.length} operator rationale(s)`,
        created_by: "operator",
        status: "active"
      });
      toast(`Promoted ${unpromoted.length} corrections into active set ${newSet.version}`, "success");
      loadCurationData();
    } catch (err: any) {
      toast(err?.message || "Failed to promote example set", "warning");
    } finally {
      setPromoting(false);
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
        description="Source-agnostic shipping document ingestion via read-only IMAP protocols (RFC 3501 EXAMINE mode)."
        actions={
          <>
            {/* Explicit source selector: the operator always knows whether what
                appears next came from a real inbox or a deterministic fixture. */}
            <div
              role="group"
              aria-label="Retrieval source"
              style={{
                display: "flex", border: "1px solid var(--border-default)",
                borderRadius: "6px", overflow: "hidden"
              }}
            >
              {(["live", "demo"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setRetrieveMode(m)}
                  disabled={retrieving}
                  title={m === "live"
                    ? "Connect to the real IMAP mailbox; fails loudly if credentials are missing"
                    : "Use the built-in deterministic fixture; never touches the network"}
                  style={{
                    padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                    border: "none",
                    background: retrieveMode === m ? "var(--primary)" : "transparent",
                    color: retrieveMode === m ? "#ffffff" : "var(--ink-secondary)"
                  }}
                >
                  {m === "live" ? "Live" : "Demo"}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              icon={<RotateCcw size={15} />}
              onClick={() => handleResetCursor(selectedConnId)}
              disabled={refreshing || retrieving}
              title="Rewind the UID cursor so already-ingested mail can be pulled again"
            >
              Reset cursor
            </Button>
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} className={refreshing ? "spin" : undefined} />}
              onClick={loadConnections}
              disabled={refreshing || retrieving}
            >
              {refreshing ? "Checking..." : "Refresh"}
            </Button>
            <Button
              variant="primary"
              icon={<ArrowDownToLine size={15} />}
              onClick={() => handleRetrieve(selectedConnId)}
              disabled={retrieving}
            >
              {retrieving ? "Retrieving..." : retrieveMode === "live" ? "Retrieve Live" : "Retrieve Demo"}
            </Button>
          </>
        }
      />

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
                Strict Read-Only IMAP (RFC 3501 §6.3.2)
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

      {/* Primary Navigation Tabs */}
      <div className="filter-pill-group" style={{ marginBottom: "20px" }}>
        <button
          type="button"
          className={`filter-pill ${activeTab === "sources" ? "active" : ""}`}
          onClick={() => setActiveTab("sources")}
        >
          <Radio size={13} style={{ marginRight: "6px" }} />
          Live Mailbox Sources ({connections.length})
        </button>
        <button
          type="button"
          className={`filter-pill ${activeTab === "curation" ? "active" : ""}`}
          onClick={() => setActiveTab("curation")}
        >
          <Sparkles size={13} style={{ marginRight: "6px" }} />
          Correction Learning Loop ({candidates.length} candidates)
        </button>
      </div>

      {activeTab === "sources" ? (
        <>
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
              const providerName =
                conn.provider === "gmail" ? "Gmail" : conn.provider === "outlook" ? "Outlook 365" : "Generic IMAP";
              const isGmail = conn.provider === "gmail";
              const isOutlook = conn.provider === "outlook";

              return (
                <div
                  key={conn.id}
                  onClick={() => setSelectedConnId(conn.id)}
                  style={{
                    background: "var(--surface)",
                    border: `1.5px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                    borderRadius: "var(--radius)",
                    padding: "18px",
                    cursor: "pointer",
                    boxShadow: isSelected ? "0 0 0 3px rgba(37, 99, 235, 0.12)" : "none",
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
                        background: "rgba(16, 185, 129, 0.1)",
                        color: "#059669",
                        borderColor: "rgba(16, 185, 129, 0.2)"
                      }}
                    >
                      EXAMINE Ready
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
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
                      {conn.last_polled_at
                        ? `Polled: ${new Date(conn.last_polled_at).toLocaleTimeString()}`
                        : "Ready for pull"}
                    </span>
                    <Button
                      variant={isSelected ? "primary" : "secondary"}
                      className="btn-sm"
                      icon={<ArrowDownToLine size={13} />}
                      disabled={retrieving}
                      onClick={() => {
                        setSelectedConnId(conn.id);
                        handleRetrieve(conn.id);
                      }}
                    >
                      {retrieving && isSelected ? "Fetching..." : "Retrieve"}
                    </Button>
                  </div>
                </div>
              );
            })}
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
                  <Link href="/inbox" className="btn btn-secondary btn-sm">
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
        </>
      ) : (
        /* Feature A: Correction-Guided Few-Shot Curation Panel */
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* ADR-006 Curation Summary Banner */}
          <div
            style={{
              padding: "16px",
              borderRadius: "var(--radius)",
              background: "rgba(37, 99, 235, 0.05)",
              border: "1px solid rgba(37, 99, 235, 0.2)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: "14px", color: "var(--ink)" }}>
                ADR-006: Governed Few-Shot Prompt Learning Loop
              </div>
              <div style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px", maxWidth: "700px" }}>
                Operator corrections do not automatically inject into models. Human rationales accumulate as candidates, which are curated and frozen into immutable versioned sets pinned to <code>policy_version</code>.
              </div>
            </div>

            <Button
              variant="primary"
              icon={<Sparkles size={14} />}
              onClick={handlePromoteBatch}
              disabled={promoting || candidates.filter((c) => !c.is_promoted).length === 0}
            >
              {promoting ? "Freezing..." : "Promote Active Set"}
            </Button>
          </div>

          {/* Active Prompt Example Sets */}
          <div className="card" style={{ padding: "18px", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 600 }}>
              Immutable Example Sets ({exampleSets.length})
            </h3>
            {exampleSets.length === 0 ? (
              <div style={{ fontSize: "13px", color: "var(--ink-muted)" }}>
                No versioned sets frozen yet. Review candidates below and promote them.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {exampleSets.map((s) => (
                  <div
                    key={s.id}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "6px",
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="mono" style={{ fontWeight: 600, fontSize: "13px" }}>
                          {s.version}
                        </span>
                        <span className={`kpi-pill ${s.status === "active" ? "active" : ""}`}>
                          {s.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: "11px", color: "var(--ink-muted)", marginTop: "2px" }}>
                        {s.notes || "Operator curated examples"} · {s.examples.length} precedent example(s)
                      </div>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unpromoted Correction Candidates */}
          <div className="card" style={{ padding: "18px", background: "var(--surface)", border: "1px solid var(--border)" }}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: 600 }}>
              Operator Correction Candidates ({candidates.length})
            </h3>
            {candidates.length === 0 ? (
              <div style={{ fontSize: "13px", color: "var(--ink-muted)" }}>
                Zero corrections logged. When an operator corrects a case category in the Case Review workspace, it appears here with its mandatory typed rationale.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Old Category</th>
                      <th>Corrected Category</th>
                      <th>Human Rationale</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((cand) => (
                      <tr key={cand.id}>
                        <td>
                          <Link href={`/cases/${cand.case_id}`} className="table-id-link">
                            {cand.email_id || cand.case_id.slice(0, 8)}
                          </Link>
                        </td>
                        <td>
                          <span style={{ color: "var(--ink-muted)", textDecoration: "line-through" }}>
                            {cand.old_category}
                          </span>
                        </td>
                        <td>
                          <span className="kpi-pill active">{cand.new_category}</span>
                        </td>
                        <td style={{ fontSize: "12px", maxWidth: "350px", fontStyle: "italic", color: "var(--ink)" }}>
                          “{cand.rationale}”
                        </td>
                        <td>
                          {cand.is_promoted ? (
                            <span className="status-badge success">Promoted</span>
                          ) : (
                            <span className="status-badge warning">Candidate</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

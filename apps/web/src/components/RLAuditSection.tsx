"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  BookOpen, CheckCircle2, Download, ExternalLink, FileCheck2,
  GitCompare, History, RefreshCw, Search, ShieldCheck, Sparkles, X
} from "lucide-react";
import { apiClient, type CorrectionCandidate } from "../api/client";
import type { AuditEvent, PrecedentSummary } from "../types";
import { useToast } from "./Toast";
import { Button } from "./UI";

export function RLAuditSection() {
  const { toast } = useToast();
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [precedents, setPrecedents] = useState<PrecedentSummary[]>([]);
  const [promptSets, setPromptSets] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<CorrectionCandidate[]>([]);
  const [promoting, setPromoting] = useState(false);
  const [auditFilter, setAuditFilter] = useState<string>("ALL");
  const [auditSearch, setAuditSearch] = useState<string>("");
  const [auditLoading, setAuditLoading] = useState<boolean>(false);

  const loadAuditData = () => {
    setAuditLoading(true);
    Promise.all([
      apiClient.listAuditEvents().catch(() => []),
      apiClient.listAllPrecedents().catch(() => []),
      apiClient.listPromptExampleSets().catch(() => []),
      apiClient.listCorrectionCandidates().catch(() => [])
    ]).then(([events, precs, sets, cands]) => {
      setAuditEvents(events);
      setPrecedents(precs);
      setPromptSets(sets);
      setCandidates(cands);
    }).finally(() => setAuditLoading(false));
  };

  useEffect(() => {
    loadAuditData();
  }, []);

  // Turns curated operator corrections into a new, immutable, versioned
  // few-shot set (ADR-006). This is the only place in the app that actually
  // calls createPromptExampleSet - the promotion step remains a deliberate,
  // human-triggered action rather than something that happens automatically
  // as corrections accumulate.
  const handlePromoteBatch = async () => {
    const unpromoted = candidates.filter((c) => !c.is_promoted);
    if (unpromoted.length === 0) {
      toast("No unpromoted corrections available in the queue", "info");
      return;
    }

    setPromoting(true);
    try {
      const nextVersionNum = promptSets.length + 1;
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
      loadAuditData();
    } catch (err: any) {
      toast(err?.message || "Failed to promote example set", "warning");
    } finally {
      setPromoting(false);
    }
  };

  const handleExportAuditLedger = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
      title: "ClearDraft Reinforcement Learning & Operator Audit Ledger",
      exported_at: new Date().toISOString(),
      standards: ["ADR-006", "Section-19-Operator-Overrides"],
      audit_events: auditEvents,
      active_precedents: precedents,
      prompt_example_sets: promptSets
    }, null, 2));
    const a = document.createElement("a");
    a.href = dataStr;
    a.download = `cleardraft-rl-audit-${new Date().toISOString().slice(0, 10)}.json`;
    a.target = "_blank";
    a.click();
    toast("Exported Reinforcement Learning Audit Ledger (.json)", "success");
  };

  const filteredEvents = auditEvents.filter((ev) => {
    if (auditFilter === "EQUIVALENCE" && ev.action !== "confirm_equivalence") return false;
    if (auditFilter === "CLASSIFICATION" && ev.action !== "classification_correction" && ev.action !== "resolve_classification") return false;
    if (auditFilter === "FIELD" && ev.action !== "correct_reading") return false;
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      const matchSub = (ev.subject || "").toLowerCase().includes(q);
      const matchCase = (ev.email_id || ev.case_id || "").toLowerCase().includes(q);
      const matchField = (ev.field || "").toLowerCase().includes(q);
      const matchReason = (ev.reason || "").toLowerCase().includes(q);
      const matchVals = (ev.old_value || "").toLowerCase().includes(q) || (ev.new_value || "").toLowerCase().includes(q);
      if (!matchSub && !matchCase && !matchField && !matchReason && !matchVals) return false;
    }
    return true;
  });

  const equivalenceCount = auditEvents.filter(e => e.action === "confirm_equivalence").length;
  const classificationCount = auditEvents.filter(e => e.action === "classification_correction" || e.action === "resolve_classification").length;
  const fieldCorrectionCount = auditEvents.filter(e => e.action === "correct_reading").length;

  return (
    <div className="rl-audit-container">
      {/* Architecture & Governance Banner */}
      <div className="rl-banner-card">
        <div className="rl-banner-head">
          <div className="rl-banner-title-group">
            <div className="rl-icon-badge">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="rl-banner-title">
                Reinforcement Learning & Precedent Memory (RLHF Audit)
              </h2>
              <p className="rl-banner-subtitle">
                Tamper-evident audit ledger of operator corrections, taught equivalence precedents, and in-context prompt policies.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                background: "rgba(16, 185, 129, 0.12)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#059669",
                padding: "4px 10px",
                borderRadius: "6px",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              <ShieldCheck size={14} />
              ADR-006 and section 19 compliant
            </span>
            <Button
              variant="primary"
              className="btn-sm"
              icon={<Download size={14} />}
              onClick={handleExportAuditLedger}
            >
              Export Audit Ledger (.json)
            </Button>
          </div>
        </div>

        {/* RL KPI Strip */}
        <div className="rl-kpi-grid">
          <div className="rl-kpi-card">
            <span className="rl-kpi-label">Audited Human Decisions</span>
            <span className="rl-kpi-val">{auditEvents.length}</span>
            <span className="rl-kpi-sub">Logged in SQLite <code className="mono">review_events</code></span>
          </div>
          <div className="rl-kpi-card">
            <span className="rl-kpi-label">Taught Precedents</span>
            <span className="rl-kpi-val" style={{ color: "#7c3aed" }}>{precedents.length}</span>
            <span className="rl-kpi-sub">Active equivalence conventions</span>
          </div>
          <div className="rl-kpi-card">
            <span className="rl-kpi-label">Prompt Memory Policies</span>
            <span className="rl-kpi-val" style={{ color: "#0d9488" }}>{promptSets.length}</span>
            <span className="rl-kpi-sub">Versioned few-shot example sets</span>
          </div>
          <div className="rl-kpi-card">
            <span className="rl-kpi-label">Foundational Weight Drift</span>
            <span className="rl-kpi-val" style={{ color: "#059669" }}>0.00%</span>
            <span className="rl-kpi-sub">Weights frozen; memory in-context</span>
          </div>
          <div className="rl-kpi-card">
            <span className="rl-kpi-label">Pending Corrections</span>
            <span className="rl-kpi-val" style={{ color: "#b45309" }}>
              {candidates.filter((c) => !c.is_promoted).length}
            </span>
            <span className="rl-kpi-sub">Awaiting curation into a versioned set</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="rl-toolbar">
        <div className="rl-filter-group">
          <button
            type="button"
            className={`rl-filter-btn ${auditFilter === "ALL" ? "active" : ""}`}
            onClick={() => setAuditFilter("ALL")}
          >
            All Events ({auditEvents.length})
          </button>
          <button
            type="button"
            className={`rl-filter-btn ${auditFilter === "EQUIVALENCE" ? "active" : ""}`}
            onClick={() => setAuditFilter("EQUIVALENCE")}
          >
            Taught Equivalences ({equivalenceCount})
          </button>
          <button
            type="button"
            className={`rl-filter-btn ${auditFilter === "CLASSIFICATION" ? "active" : ""}`}
            onClick={() => setAuditFilter("CLASSIFICATION")}
          >
            Classification ({classificationCount})
          </button>
          <button
            type="button"
            className={`rl-filter-btn ${auditFilter === "FIELD" ? "active" : ""}`}
            onClick={() => setAuditFilter("FIELD")}
          >
            Field Corrections ({fieldCorrectionCount})
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div className="rl-search-input">
            <Search size={14} style={{ color: "var(--ink-muted)" }} />
            <input
              placeholder="Filter by subject, field, rationale..."
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
            />
            {auditSearch && (
              <button
                type="button"
                onClick={() => setAuditSearch("")}
                style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-muted)" }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadAuditData}
            title="Refresh audit ledger from server"
          >
            <RefreshCw size={13} className={auditLoading ? "spin" : undefined} />
            Refresh
          </button>
        </div>
      </div>

      {/* Audit Ledger Table */}
      <div className="rl-table-card">
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border-default)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <strong style={{ fontSize: "14px", color: "var(--ink-primary)" }}>
              Audited Human Actions & Memory Injections
            </strong>
            <span style={{ fontSize: "12px", color: "var(--ink-muted)", marginLeft: "8px" }}>
              Showing {filteredEvents.length} of {auditEvents.length} records
            </span>
          </div>
          <span className="mono" style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
            Table: <code className="mono">review_events</code> (Append-Only)
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="rl-table">
            <thead>
              <tr>
                <th style={{ width: "130px" }}>Timestamp</th>
                <th style={{ width: "200px" }}>Case / Source</th>
                <th style={{ width: "150px" }}>Action</th>
                <th style={{ width: "130px" }}>Field</th>
                <th style={{ minWidth: "240px" }}>Value Shift (Old ➔ Taught)</th>
                <th style={{ minWidth: "280px" }}>Operator Rationale</th>
                <th style={{ width: "110px" }}>Precedent</th>
              </tr>
            </thead>
            <tbody>
              {filteredEvents.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "var(--ink-muted)" }}>
                    No audit events matching current criteria.
                  </td>
                </tr>
              ) : (
                filteredEvents.map((ev) => {
                  const isEquivalence = ev.action === "confirm_equivalence";
                  const isCorrection = ev.action === "classification_correction" || ev.action === "resolve_classification";
                  const cleanRationale = (ev.reason || "").replace(/\s*\[time_to_resolve:.*?\]/, "").trim();

                  return (
                    <tr key={ev.id}>
                      <td>
                        <div className="mono" style={{ fontSize: "11px", color: "var(--ink-primary)" }}>
                          {ev.created_at ? new Date(ev.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}
                        </div>
                        <div style={{ fontSize: "10px", color: "var(--ink-muted)" }}>
                          {ev.created_at ? new Date(ev.created_at).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}
                        </div>
                      </td>

                      <td>
                        <Link
                          href={`/cases/${ev.case_id}`}
                          style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--primary)", fontWeight: 700, fontSize: "12px", textDecoration: "none" }}
                          title={ev.subject}
                        >
                          <span>{ev.email_id || ev.case_id.slice(0, 8)}</span>
                          <ExternalLink size={11} />
                        </Link>
                        <div style={{ fontSize: "11px", color: "var(--ink-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "180px" }} title={ev.subject}>
                          {ev.subject || "Verification Case"}
                        </div>
                      </td>

                      <td>
                        <span className={`rl-action-chip ${isEquivalence ? "equivalence" : isCorrection ? "correction" : "reading"}`}>
                          {isEquivalence ? <GitCompare size={11} /> : isCorrection ? <CheckCircle2 size={11} /> : <FileCheck2 size={11} />}
                          {isEquivalence ? "Equivalence" : isCorrection ? "Classify" : "Field Value"}
                        </span>
                      </td>

                      <td>
                        <span className="mono" style={{ fontSize: "11.5px", background: "var(--bg-subtle)", padding: "2px 6px", borderRadius: "4px", color: "var(--ink-primary)", fontWeight: 600 }}>
                          {ev.field || (isCorrection ? "category" : "document")}
                        </span>
                      </td>

                      <td>
                        <div className="rl-diff-pill-wrap">
                          <span className="rl-diff-old" title={ev.old_value || "None"}>
                            {ev.old_value || "—"}
                          </span>
                          <span className="rl-diff-arrow">➔</span>
                          <span className="rl-diff-new" title={ev.new_value || "None"}>
                            {ev.new_value || "—"}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: "12px", color: "var(--ink-primary)", lineHeight: 1.4 }}>
                          &ldquo;{cleanRationale || "Operator confirmed match without comment."}&rdquo;
                        </div>
                      </td>

                      <td>
                        {isEquivalence ? (
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "#7c3aed", background: "rgba(139, 92, 246, 0.12)", border: "1px solid rgba(139, 92, 246, 0.25)", padding: "2px 6px", borderRadius: "4px" }}>
                            Active
                          </span>
                        ) : isCorrection ? (
                          <span style={{ fontSize: "10px", fontWeight: 700, color: "#0d9488", background: "rgba(20, 184, 166, 0.12)", border: "1px solid rgba(20, 184, 166, 0.25)", padding: "2px 6px", borderRadius: "4px" }}>
                            Promoted
                          </span>
                        ) : (
                          <span style={{ fontSize: "10px", color: "var(--ink-muted)" }}>
                            Recorded
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Active Taught Equivalence Precedents */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <BookOpen size={16} style={{ color: "#7c3aed" }} />
            <h3 style={{ fontSize: "15px", fontWeight: 700, color: "var(--ink-primary)", margin: 0 }}>
              Active Learned Equivalence Conventions ({precedents.length})
            </h3>
          </div>
          <span style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
            Precedent memory injected into comparison stages as human review aids
          </span>
        </div>

        <div className="rl-precedents-grid">
          {precedents.map((p) => (
            <div key={p.id} className="rl-precedent-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: "12px", fontWeight: 700, color: "#7c3aed", background: "rgba(139, 92, 246, 0.1)", padding: "2px 8px", borderRadius: "4px" }}>
                  Field: {p.field}
                </span>
                <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#059669", background: "rgba(16, 185, 129, 0.1)", padding: "2px 6px", borderRadius: "4px" }}>
                  Active Precedent
                </span>
              </div>

              <div className="rl-diff-pill-wrap" style={{ margin: "4px 0" }}>
                <span className="rl-diff-old" title={p.old_value} style={{ maxWidth: "140px" }}>{p.old_value}</span>
                <span className="rl-diff-arrow">↔</span>
                <span className="rl-diff-new" title={p.new_value} style={{ maxWidth: "140px" }}>{p.new_value}</span>
              </div>

              <div style={{ fontSize: "12px", color: "var(--ink-primary)", fontStyle: "italic", background: "var(--bg-subtle)", padding: "8px 10px", borderRadius: "6px", lineHeight: 1.4 }}>
                &ldquo;{p.clean_rationale || p.reason}&rdquo;
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--ink-muted)", marginTop: "auto" }}>
                <Link href={`/cases/${p.case_id}`} style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>
                  Case: {p.email_id || p.case_id.slice(0, 8)}
                </Link>
                <span>{new Date(p.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2.5: Correction Candidates Awaiting Promotion. This is the
          actual human-gated step ADR-006 describes: an operator correction
          only ever reaches a prompt after someone reviews it here and clicks
          Promote - nothing is injected automatically as corrections accrue. */}
      <div className="card" style={{ padding: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", flexWrap: "wrap", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Sparkles size={16} style={{ color: "var(--primary)" }} />
            <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>
              Correction Candidates Awaiting Promotion ({candidates.filter((c) => !c.is_promoted).length})
            </h3>
          </div>
          <Button
            variant="primary"
            className="btn-sm"
            icon={<CheckCircle2 size={14} />}
            onClick={handlePromoteBatch}
            disabled={promoting || candidates.filter((c) => !c.is_promoted).length === 0}
          >
            {promoting ? "Freezing..." : "Promote Active Set"}
          </Button>
        </div>
        <p style={{ fontSize: "12px", color: "var(--ink-muted)", margin: "0 0 14px 0", lineHeight: 1.5 }}>
          Operator corrections do not automatically inject into models. Human rationales accumulate as candidates here,
          which are curated and frozen into an immutable versioned set pinned to <code className="mono">policy_version</code>.
        </p>

        {candidates.filter((c) => !c.is_promoted).length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px", color: "var(--ink-muted)", fontSize: "13px" }}>
            No corrections awaiting promotion. Correcting a case's category on the case page adds a candidate here.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {candidates.filter((c) => !c.is_promoted).map((cand) => (
              <div key={cand.id} style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginBottom: "6px", flexWrap: "wrap" }}>
                  <Link href={`/cases/${cand.case_id}`} style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--primary)", fontWeight: 700, fontSize: "12.5px", textDecoration: "none" }}>
                    <span>{cand.email_id}</span>
                    <ExternalLink size={11} />
                  </Link>
                  <span className="mono" style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
                    {cand.old_category} <span style={{ margin: "0 4px" }}>→</span> <strong style={{ color: "var(--ink-primary)" }}>{cand.new_category}</strong>
                  </span>
                </div>
                <div style={{ fontSize: "12px", color: "var(--ink-primary)", fontStyle: "italic", marginBottom: "4px" }}>
                  &ldquo;{cand.rationale}&rdquo;
                </div>
                <div style={{ fontSize: "11.5px", color: "var(--ink-muted)" }} title={cand.subject}>
                  {cand.subject}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Promoted Prompt Example Sets */}
      {promptSets.length > 0 && (
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <History size={16} style={{ color: "var(--primary)" }} />
              <h3 style={{ fontSize: "15px", fontWeight: 700, margin: 0 }}>
                In-Context Reinforcement Policies (<code className="mono">prompt_example_sets</code>)
              </h3>
            </div>
            <span className="mono" style={{ fontSize: "11.5px", color: "var(--ink-muted)" }}>
              Frozen Example Injection (ADR-006)
            </span>
          </div>

          {promptSets.map((ps) => (
            <div key={ps.id} style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)", borderRadius: "8px", padding: "16px", marginBottom: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span className="mono" style={{ fontSize: "13px", fontWeight: 800, color: "var(--primary)" }}>
                    {ps.version}
                  </span>
                  <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#059669", background: "rgba(16, 185, 129, 0.15)", padding: "2px 6px", borderRadius: "4px" }}>
                    {ps.status?.toUpperCase()}
                  </span>
                </div>
                <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
                  Author: <strong style={{ color: "var(--ink-primary)" }}>{ps.created_by}</strong> · {new Date(ps.created_at).toLocaleDateString()}
                </span>
              </div>

              <p style={{ fontSize: "12px", color: "var(--ink-secondary)", margin: "0 0 10px 0" }}>
                {ps.notes}
              </p>

              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "6px", padding: "12px" }}>
                <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--ink-muted)", display: "block", marginBottom: "6px" }}>
                  Injected In-Context Prompt Examples ({ps.examples?.length || 0})
                </span>
                {(ps.examples || []).map((ex: any, idx: number) => (
                  <div key={idx} style={{ fontSize: "11.5px", color: "var(--ink-primary)", lineHeight: 1.5, borderLeft: "2px solid #6366f1", paddingLeft: "10px", margin: "6px 0" }}>
                    <strong>Category:</strong> <span className="mono" style={{ color: "#4f46e5" }}>{ex.category}</span> — <em>&ldquo;{ex.rationale}&rdquo;</em>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

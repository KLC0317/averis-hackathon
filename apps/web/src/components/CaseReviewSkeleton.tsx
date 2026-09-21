"use client";

import React, { useEffect, useState } from "react";
import {
  FileText,
  FileCheck2,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Layers,
  ArrowRight,
  ShieldCheck,
  SplitSquareVertical
} from "lucide-react";

const LOADING_STAGES = [
  "Retrieving dual-document evidence packet & OCR streams…",
  "Cross-referencing 7 mandatory trade fields (Shipper, Consignee, POD, Weight)…",
  "Evaluating dual-model arbitration & discrepancy findings…",
  "Preparing side-by-side reconciliation workspace…"
];

export function CaseReviewSkeleton() {
  const [stageIdx, setStageIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStageIdx((prev) => (prev + 1) % LOADING_STAGES.length);
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="case-redesign-wrap case-skeleton-wrap" aria-busy="true" aria-live="polite">
      {/* Top Header Row Skeleton */}
      <div>
        <div className="skeleton-line skeleton-shimmer" style={{ width: "110px", height: "18px", marginBottom: "14px" }} />

        <div className="case-header-row">
          <div className="case-title-block">
            <div className="skeleton-line skeleton-shimmer-blue" style={{ width: "340px", height: "28px", marginBottom: "8px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div className="skeleton-line skeleton-shimmer" style={{ width: "85px", height: "16px" }} />
              <div className="skeleton-line skeleton-shimmer" style={{ width: "130px", height: "16px" }} />
              <div className="skeleton-line skeleton-shimmer" style={{ width: "65px", height: "16px" }} />
            </div>
          </div>

          <div className="case-header-actions">
            <div className="skeleton-btn skeleton-shimmer" style={{ width: "115px", height: "36px", borderRadius: "8px" }} />
            <div className="skeleton-btn skeleton-shimmer" style={{ width: "135px", height: "36px", borderRadius: "8px" }} />
            <div className="skeleton-btn skeleton-shimmer" style={{ width: "36px", height: "36px", borderRadius: "8px" }} />
          </div>
        </div>
      </div>

      {/* Elevated Colorful Loading Status Banner with Live Text */}
      <div className="skeleton-banner-rich">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div className="skeleton-loading-icon-wrap">
            <div className="skeleton-loading-icon-pulse" />
            <Sparkles size={20} className="spinner-rotate" style={{ animationDuration: "6s" }} />
          </div>

          <div className="skeleton-loading-text-group">
            <div className="skeleton-loading-headline">
              <span>Loading Verification Workspace</span>
              <span className="skeleton-tag-live">
                <span className="skeleton-pulse-dot" />
                Live Analysis
              </span>
            </div>
            <div className="skeleton-loading-subtext">
              <span className="skeleton-stage-ticker">{LOADING_STAGES[stageIdx]}</span>
            </div>
          </div>
        </div>

        <div className="skeleton-banner-right-chip">
          <Loader2 size={14} className="spinner-rotate" style={{ color: "#2563eb" }} />
          <span style={{ fontWeight: 600, color: "#1e40af" }}>Reconciling Trade Fields</span>
        </div>

        {/* Indeterminate bottom gradient progress bar */}
        <div className="skeleton-banner-progress" />
      </div>

      {/* Document File Strip with Brand Colors */}
      <div className="case-doc-strip">
        <div className="doc-strip-col" style={{ background: "rgba(240, 249, 255, 0.7)", borderColor: "rgba(186, 230, 253, 0.8)" }}>
          <div className="doc-strip-info" style={{ width: "100%" }}>
            <span className="doc-strip-tag-si">SI Reference</span>
            <FileText size={15} style={{ color: "#2563eb" }} />
            <div className="skeleton-line skeleton-shimmer-blue" style={{ width: "180px", height: "16px" }} />
          </div>
          <div style={{ fontSize: "11px", color: "#0284c7", fontWeight: 500, flexShrink: 0 }}>
            Reading OCR blocks…
          </div>
        </div>

        <div className="doc-strip-col" style={{ background: "rgba(240, 253, 244, 0.7)", borderColor: "rgba(187, 247, 208, 0.8)" }}>
          <div className="doc-strip-info" style={{ width: "100%" }}>
            <span className="doc-strip-tag-bl">Draft B/L</span>
            <FileCheck2 size={15} style={{ color: "#16a34a" }} />
            <div className="skeleton-line skeleton-shimmer-emerald" style={{ width: "180px", height: "16px" }} />
          </div>
          <div style={{ fontSize: "11px", color: "#15803d", fontWeight: 500, flexShrink: 0 }}>
            Cross-referencing…
          </div>
        </div>
      </div>

      {/* Main Two-Column Grid matching .case-workspace-two-col */}
      <div className="case-workspace-two-col">
        {/* Left Sidebar: Required Fields List with Distinct Status Colors */}
        <aside className="case-fields-panel">
          <div className="fields-panel-header">
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginBottom: "2px" }}>
                Required Fields
              </div>
              <div style={{ fontSize: "12px", color: "#64748b" }}>
                7 standard trade checks
              </div>
            </div>
            <div className="skeleton-reconciling-badge">
              <ShieldCheck size={12} />
              <span>Verifying</span>
            </div>
          </div>

          <div className="fields-panel-filters">
            <div className="filter-pill active" style={{ padding: "4px 10px", fontSize: "12px", fontWeight: 600 }}>
              All (7)
            </div>
            <div className="filter-pill" style={{ padding: "4px 10px", fontSize: "12px" }}>
              Diffs (2)
            </div>
          </div>

          <div className="fields-list">
            {[
              { label: "Shipper", status: "OK", tag: "Match", color: "emerald", icon: CheckCircle2 },
              { label: "Consignee", status: "DIFF", tag: "Mismatch", color: "amber", icon: AlertCircle, active: true },
              { label: "Notify Party", status: "OK", tag: "Match", color: "emerald", icon: CheckCircle2 },
              { label: "Port of Loading (POL)", status: "OK", tag: "Match", color: "emerald", icon: CheckCircle2 },
              { label: "Port of Discharge (POD)", status: "DIFF", tag: "Review", color: "amber", icon: AlertCircle },
              { label: "Container Count", status: "OK", tag: "Match", color: "emerald", icon: CheckCircle2 },
              { label: "Gross Weight (KG)", status: "OK", tag: "Match", color: "emerald", icon: CheckCircle2 }
            ].map((f, i) => {
              const IconComp = f.icon;
              return (
                <div
                  key={i}
                  className={`field-row-item skeleton-field-row ${f.active ? "active" : ""}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 12px",
                    cursor: "default",
                    background: f.active ? "rgba(239, 246, 255, 0.85)" : undefined,
                    borderLeft: f.active ? "3px solid #2563eb" : undefined
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "9px", flex: 1 }}>
                    <IconComp
                      size={15}
                      style={{
                        color: f.color === "emerald" ? "#10b981" : "#f59e0b",
                        flexShrink: 0
                      }}
                    />
                    <span style={{ fontSize: "13px", fontWeight: f.active ? 600 : 500, color: f.active ? "#1d4ed8" : "#334155" }}>
                      {f.label}
                    </span>
                  </div>

                  <span
                    className={`skeleton-shimmer-${f.color}`}
                    style={{
                      padding: "2px 8px",
                      borderRadius: "9999px",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: f.color === "emerald" ? "#065f46" : "#92400e",
                      border: f.color === "emerald" ? "1px solid #a7f3d0" : "1px solid #fde68a"
                    }}
                  >
                    {f.tag}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Right Area: Stage Comparison Card & Evidence Skeleton */}
        <main className="case-stage-panel">
          {/* Stage Top Bar */}
          <div className="stage-heading-row">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <span style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Consignee</span>
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    background: "#fef3c7",
                    color: "#92400e",
                    border: "1px solid #fde68a"
                  }}
                >
                  Discrepancy Detected
                </span>
              </div>
              <div style={{ fontSize: "13px", color: "#64748b" }}>
                Reconciling entity address and tax ID between SI and Draft B/L
              </div>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <div className="skeleton-btn skeleton-shimmer" style={{ width: "80px", height: "30px", borderRadius: "6px" }} />
              <div className="skeleton-btn skeleton-shimmer" style={{ width: "70px", height: "30px", borderRadius: "6px" }} />
              <div className="skeleton-btn skeleton-shimmer" style={{ width: "110px", height: "30px", borderRadius: "6px" }} />
            </div>
          </div>

          {/* Extracted Values Side-by-Side Comparison Skeleton with Colors */}
          <div className="extracted-cards-grid">
            {/* Left Document Box (SI) */}
            <div className="extracted-val-card" style={{ borderTop: "3px solid #3b82f6" }}>
              <div className="extracted-val-card-head">
                <span className="skeleton-card-head-badge skeleton-card-head-si">
                  <FileText size={13} />
                  Shipping Instruction (SI)
                </span>
                <span style={{ fontSize: "11px", color: "#2563eb", fontWeight: 600 }}>SOURCE</span>
              </div>
              <div style={{ margin: "12px 0" }}>
                <div className="skeleton-line skeleton-shimmer-blue" style={{ width: "90%", height: "22px", marginBottom: "8px" }} />
                <div className="skeleton-line skeleton-shimmer" style={{ width: "65%", height: "16px" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", borderTop: "1px solid var(--border-default)" }}>
                <span style={{ fontSize: "12px", color: "#64748b" }}>Locator: Line 06 · Page 1</span>
                <span style={{ fontSize: "11px", color: "#16a34a", fontWeight: 600 }}>Conf: 99.4%</span>
              </div>
            </div>

            {/* Right Document Box (Draft BL) */}
            <div className="extracted-val-card" style={{ borderTop: "3px solid #f59e0b" }}>
              <div className="extracted-val-card-head">
                <span className="skeleton-card-head-badge skeleton-card-head-bl" style={{ color: "#d97706" }}>
                  <FileCheck2 size={13} />
                  Draft Bill of Lading (B/L)
                </span>
                <span style={{ fontSize: "11px", color: "#d97706", fontWeight: 600 }}>TARGET DRAFT</span>
              </div>
              <div style={{ margin: "12px 0" }}>
                <div className="skeleton-line skeleton-shimmer-amber" style={{ width: "85%", height: "22px", marginBottom: "8px" }} />
                <div className="skeleton-line skeleton-shimmer" style={{ width: "55%", height: "16px" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "8px", borderTop: "1px solid var(--border-default)" }}>
                <span style={{ fontSize: "12px", color: "#64748b" }}>Locator: Line 08 · Page 1</span>
                <span style={{ fontSize: "11px", color: "#d97706", fontWeight: 600 }}>Diff Detected</span>
              </div>
            </div>
          </div>

          {/* Evidence Viewer Skeleton */}
          <div className="dual-evidence-viewer">
            <div className="stage-tabs-row" style={{ padding: "10px 16px" }}>
              <div className="stage-tabs-left" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: 600, color: "#2563eb" }}>
                  <SplitSquareVertical size={14} />
                  Dual Evidence Alignment
                </div>
                <div className="skeleton-line skeleton-shimmer" style={{ width: "95px", height: "20px" }} />
              </div>
              <div className="skeleton-line skeleton-shimmer" style={{ width: "80px", height: "26px", borderRadius: "6px" }} />
            </div>

            <div className="viewer-columns-grid">
              {/* SI Column Lines */}
              <div className="viewer-pane">
                <div className="viewer-pane-head" style={{ background: "#f8fafc" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#1e40af" }}>
                    <FileText size={13} />
                    SI Source Document Stream
                  </div>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>OCR Text</span>
                </div>
                <div style={{ padding: "14px 16px" }}>
                  {[
                    { pct: 80, num: "01" },
                    { pct: 95, num: "02" },
                    { pct: 60, num: "03" },
                    { pct: 85, num: "04" },
                    { pct: 70, num: "05" },
                    { pct: 90, num: "06", highlighted: true },
                    { pct: 75, num: "07" },
                    { pct: 50, num: "08" }
                  ].map((row, idx) => (
                    <div
                      key={idx}
                      className={`skeleton-ocr-line ${row.highlighted ? "highlighted" : ""}`}
                    >
                      <span className="skeleton-line-num">{row.num}</span>
                      <div
                        className={row.highlighted ? "skeleton-line skeleton-shimmer-blue" : "skeleton-line skeleton-shimmer"}
                        style={{
                          width: `${row.pct}%`,
                          height: "15px",
                          borderRadius: "4px"
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* BL Column Lines */}
              <div className="viewer-pane">
                <div className="viewer-pane-head" style={{ background: "#f8fafc" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "#15803d" }}>
                    <FileCheck2 size={13} />
                    Draft B/L Stream
                  </div>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>OCR Text</span>
                </div>
                <div style={{ padding: "14px 16px" }}>
                  {[
                    { pct: 75, num: "01" },
                    { pct: 85, num: "02" },
                    { pct: 90, num: "03" },
                    { pct: 65, num: "04" },
                    { pct: 55, num: "05" },
                    { pct: 70, num: "06" },
                    { pct: 80, num: "07" },
                    { pct: 88, num: "08", highlighted: true }
                  ].map((row, idx) => (
                    <div
                      key={idx}
                      className={`skeleton-ocr-line ${row.highlighted ? "highlighted" : ""}`}
                    >
                      <span className="skeleton-line-num">{row.num}</span>
                      <div
                        className={row.highlighted ? "skeleton-line skeleton-shimmer-amber" : "skeleton-line skeleton-shimmer"}
                        style={{
                          width: `${row.pct}%`,
                          height: "15px",
                          borderRadius: "4px"
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Floating Bottom Sticky Bar Skeleton */}
      <footer className="case-bottom-sticky-bar">
        <div className="bottom-bar-left">
          <div className="skeleton-circle skeleton-shimmer-amber" style={{ width: "16px", height: "16px", borderRadius: "50%" }} />
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
            Aligning dual-model discrepancy confidence scores…
          </span>
        </div>

        <div className="bottom-bar-right">
          <div className="skeleton-btn skeleton-shimmer" style={{ width: "120px", height: "34px", borderRadius: "6px" }} />
          <div className="skeleton-btn skeleton-shimmer-blue" style={{ width: "110px", height: "34px", borderRadius: "6px" }} />
        </div>
      </footer>
    </div>
  );
}

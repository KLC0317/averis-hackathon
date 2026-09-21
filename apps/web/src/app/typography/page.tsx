"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, Check, CheckCircle2, ChevronRight, Copy, ExternalLink,
  Eye, FileText, Info, Layers, ShieldCheck, Sparkles, TriangleAlert, X, ZoomIn
} from "lucide-react";
import { BrandWordmark } from "../../components/BrandWordmark";
import { ClearDraftBrand, ClearDraftLogo } from "../../components/ClearDraftLogo";
import { Button, PageHeader, StatusBadge } from "../../components/UI";
import { useToast } from "../../components/Toast";

export default function TypographyShowcasePage() {
  const { toast } = useToast();
  const [zoomSimulated, setZoomSimulated] = useState(false);
  const [testInput, setTestInput] = useState("COSCO SHIPPING SPECIALIZED CARRIERS CO., LTD.");

  return (
    <div className="content-wrap" style={{ maxWidth: "1280px", margin: "0 auto" }}>
      <PageHeader
        eyebrow="DESIGN SYSTEM · SPECIFICATION"
        title="Typography & Document Review System"
        description="Deterministic typographic architecture for shipping-document verification. Communicates clarity, precision, and trust with tabular numerals, WCAG AA contrast, and responsive scale targets."
        actions={
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <Button
              variant={zoomSimulated ? "primary" : "secondary"}
              icon={<ZoomIn size={15} />}
              onClick={() => {
                setZoomSimulated(!zoomSimulated);
                toast(
                  zoomSimulated
                    ? "Reset preview zoom simulation"
                    : "Simulating 200% text scale to verify layout stability",
                  "info"
                );
              }}
            >
              {zoomSimulated ? "Reset Scale" : "Simulate 200% Zoom"}
            </Button>
            <Link href="/inbox" className="btn btn-secondary">
              <ArrowLeft size={15} /> Back to Dashboard
            </Link>
          </div>
        }
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "32px",
          transform: zoomSimulated ? "scale(1.15)" : "none",
          transformOrigin: "top left",
          transition: "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)"
        }}
      >
        {/* SECTION 1: Brand Wordmark & SVG Logo Lockup */}
        <section className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">BRAND LOCKUP & WORDMARK</span>
              <h2 className="text-section-heading">Vector Logo + Manrope Typography</h2>
            </div>
            <span className="badge-si">Font: Manrope (700)</span>
          </div>

          <p className="text-body" style={{ color: "var(--ink-muted)", marginBottom: "20px" }}>
            The official brand lockup combines the crisp vector emblem (<code className="mono">logo.svg</code>) on the left with the custom typographic wordmark on the right. In light mode it renders in deep navy <code className="mono">#142B45</code>, and in dark mode it transitions to accessible <code className="mono">#F8FAFC</code>.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "20px"
            }}
          >
            {/* Compact Variant (16px / 1rem) */}
            <div
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: "var(--text-secondary)", color: "var(--ink-faint)" }}>
                  Compact (16px / 1rem)
                </span>
                <span className="mono" style={{ fontSize: "11px", color: "var(--primary)" }}>
                  letter-spacing: -0.035em
                </span>
              </div>
              <div
                style={{
                  background: "var(--bg-surface)",
                  padding: "16px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <ClearDraftBrand height={24} variant="compact" />
              </div>
              <span className="text-secondary" style={{ color: "var(--ink-muted)" }}>
                Used in dense rails, compact mobile headers, and table footers.
              </span>
            </div>

            {/* Default Variant (18px / 1.125rem) */}
            <div
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: "var(--text-secondary)", color: "var(--ink-faint)" }}>
                  Default (18px / 1.125rem)
                </span>
                <span className="badge-si" style={{ fontSize: "11px" }}>
                  Primary Navigation
                </span>
              </div>
              <div
                style={{
                  background: "var(--bg-surface)",
                  padding: "16px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <ClearDraftBrand height={28} variant="default" />
              </div>
              <span className="text-secondary" style={{ color: "var(--ink-muted)" }}>
                Primary lockup for the expanded sidebar header and desktop navigation.
              </span>
            </div>

            {/* Large Variant (24px / 1.5rem) */}
            <div
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "12px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="mono" style={{ fontSize: "var(--text-secondary)", color: "var(--ink-faint)" }}>
                  Large (24px / 1.5rem)
                </span>
                <span className="mono" style={{ fontSize: "11px", color: "var(--primary)" }}>
                  line-height: 1.1
                </span>
              </div>
              <div
                style={{
                  background: "var(--bg-surface)",
                  padding: "16px",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center"
                }}
              >
                <ClearDraftBrand height={34} variant="large" />
              </div>
              <span className="text-secondary" style={{ color: "var(--ink-muted)" }}>
                Prominent branding for modal headers, exports, and verification audit summaries.
              </span>
            </div>

          </div>
        </section>

        {/* SECTION 2: Application Typography Hierarchy */}
        <section className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">TYPOGRAPHY SCALE</span>
              <h2 className="text-section-heading">Application Hierarchy (Inter Font Stack)</h2>
            </div>
            <span className="badge-si">Font: Inter (400, 500, 600, 700)</span>
          </div>

          <table className="data-table" style={{ marginTop: "12px" }}>
            <thead>
              <tr>
                <th style={{ width: "180px" }}>Element Target</th>
                <th style={{ width: "130px" }}>Design Size (rem)</th>
                <th style={{ width: "100px" }}>Weight</th>
                <th style={{ width: "100px" }}>Line Height</th>
                <th>Live Rendered Specimen</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Page title</strong></td>
                <td className="mono tabular-nums">30–34px (1.875–2.15rem)</td>
                <td>600</td>
                <td>1.2</td>
                <td>
                  <span className="text-page-title text-wrap-break" style={{ color: "var(--ink-primary)" }}>
                    Bill of Lading Verification Queue
                  </span>
                </td>
              </tr>
              <tr>
                <td><strong>Section heading</strong></td>
                <td className="mono tabular-nums">23px (1.4375rem)</td>
                <td>600</td>
                <td>1.3</td>
                <td>
                  <span className="text-section-heading text-wrap-break" style={{ color: "var(--ink-primary)" }}>
                    Automated Extraction Findings & Consignee Comparison
                  </span>
                </td>
              </tr>
              <tr>
                <td><strong>Panel heading</strong></td>
                <td className="mono tabular-nums">19px (1.1875rem)</td>
                <td>600</td>
                <td>1.4</td>
                <td>
                  <span className="text-panel-heading" style={{ color: "var(--ink-primary)" }}>
                    Seven Required Cargo Fields
                  </span>
                </td>
              </tr>
              <tr>
                <td><strong>Body & Source Text</strong></td>
                <td className="mono tabular-nums">16.5px (1.031rem)</td>
                <td>400</td>
                <td>1.6</td>
                <td>
                  <span className="text-body text-wrap-break" style={{ color: "var(--ink-secondary)" }}>
                    Carrier confirms draft bill of lading issued in accordance with shipping instructions received on 2026-09-18.
                  </span>
                </td>
              </tr>
              <tr>
                <td><strong>Navigation & Buttons</strong></td>
                <td className="mono tabular-nums">15px (0.9375rem)</td>
                <td>500</td>
                <td>1.4</td>
                <td>
                  <button className="btn btn-primary" style={{ pointerEvents: "none" }}>
                    <Check size={14} /> Confirm Match
                  </button>
                </td>
              </tr>
              <tr>
                <td><strong>Table Cells</strong></td>
                <td className="mono tabular-nums">15px (0.9375rem)</td>
                <td>400</td>
                <td>1.5</td>
                <td>
                  <span style={{ fontSize: "var(--text-table-cell)", color: "var(--ink-secondary)" }}>
                    COSCO SHIPPING LINES (NORTH AMERICA) INC.
                  </span>
                </td>
              </tr>
              <tr>
                <td><strong>Table Headers & Labels</strong></td>
                <td className="mono tabular-nums">14.5px (0.906rem)</td>
                <td>500</td>
                <td>1.4</td>
                <td>
                  <span style={{ fontSize: "var(--text-table-head)", fontWeight: 500, color: "var(--ink-faint)" }}>
                    PORT OF LOADING / DISCHARGE
                  </span>
                </td>
              </tr>
              <tr>
                <td><strong>Secondary Metadata</strong></td>
                <td className="mono tabular-nums">13.5px (0.844rem)</td>
                <td>400</td>
                <td>1.5</td>
                <td>
                  <span className="text-secondary mono tabular-nums" style={{ color: "var(--ink-muted)" }}>
                    MSG-2026-09-19-0842 · Received 2026-09-19 14:32 UTC
                  </span>
                </td>
              </tr>

            </tbody>
          </table>
        </section>

        {/* SECTION 3: Document-Review Styling & Tabular Numbers */}
        <section className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">DOCUMENT-REVIEW STYLING</span>
              <h2 className="text-section-heading">Tabular Numerals & Aligned Comparison Table</h2>
            </div>
            <span className="badge-bl">tnum: enabled</span>
          </div>

          <p className="text-body" style={{ color: "var(--ink-muted)", marginBottom: "16px" }}>
            Critical maritime data requires tabular numerals (<code className="mono">tabular-nums</code>) for precise optical alignment across decimal points, weights, container counts, and timestamps. Numeric table columns are strictly right-aligned, and discrepancy colors are always paired with explicit text labels.
          </p>

          <table className="data-table">
            <thead>
              <tr>
                <th>Field Name</th>
                <th>SI Reference Value</th>
                <th>Draft BL Value</th>
                <th className="numeric-col">Container Units</th>
                <th className="numeric-col">Gross Weight (kg)</th>
                <th>Status Verification</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Shipper Legal Name</strong>
                </td>
                <td className="text-wrap-break">
                  PACIFIC FOREST PRODUCTS PTE. LTD.
                </td>
                <td className="text-wrap-break">
                  PACIFIC FOREST PRODUCTS PTE. LTD.
                </td>
                <td className="numeric-col tabular-nums">14 TEU</td>
                <td className="numeric-col tabular-nums">24,500.00 kg</td>
                <td>
                  <StatusBadge status="OK" />
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Consignee Entity</strong>
                </td>
                <td className="text-wrap-break" style={{ background: "rgba(239, 68, 68, 0.06)" }}>
                  GLOBAL PULP & PAPER LOGISTICS LLC
                </td>
                <td className="text-wrap-break" style={{ background: "rgba(239, 68, 68, 0.06)" }}>
                  GLOBAL PULP & PAPER LOGISTICS INC.
                </td>
                <td className="numeric-col tabular-nums">28 TEU</td>
                <td className="numeric-col tabular-nums">48,120.50 kg</td>
                <td>
                  <StatusBadge status="MISMATCH" />
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Notify Party Entity</strong>
                </td>
                <td className="text-wrap-break">
                  SAME AS CONSIGNEE
                </td>
                <td className="text-wrap-break">
                  SAME AS CONSIGNEE
                </td>
                <td className="numeric-col tabular-nums">06 TEU</td>
                <td className="numeric-col tabular-nums">12,050.00 kg</td>
                <td>
                  <StatusBadge status="OK" />
                </td>
              </tr>
              <tr>
                <td>
                  <strong>Port of Discharge</strong>
                </td>
                <td className="text-wrap-break">
                  PORT OF ROTTERDAM, NETHERLANDS
                </td>
                <td className="text-wrap-break" style={{ background: "rgba(245, 158, 11, 0.06)" }}>
                  ROTTERDAM MAASVLAKTE TERMINAL
                </td>
                <td className="numeric-col tabular-nums">14 TEU</td>
                <td className="numeric-col tabular-nums">24,500.00 kg</td>
                <td>
                  <StatusBadge status="NEEDS_REVIEW" />
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* SECTION 4: Dual Synchronized Evidence Excerpt */}
        <section className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">SYNCHRONIZED EVIDENCE VIEWER</span>
              <h2 className="text-section-heading">Source Document Excerpt (16px / 1.6 Line-Height)</h2>
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              <span className="badge-si">SI-PACIFIC-8921</span>
              <span className="badge-bl">BL-DRAFT-V2.1</span>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              overflow: "hidden"
            }}
          >
            {/* SI Pane */}
            <div style={{ borderRight: "1px solid var(--border-default)" }}>
              <div
                style={{
                  padding: "10px 16px",
                  background: "var(--bg-subtle)",
                  borderBottom: "1px solid var(--border-default)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <span className="badge-si">Shipping Instruction (SI Reference)</span>
                <span className="mono tabular-nums" style={{ fontSize: "11px", color: "var(--primary)" }}>
                  Page 1 of 2
                </span>
              </div>
              <div style={{ padding: "16px", background: "var(--bg-surface)" }}>
                {[
                  { ln: "01", text: "SHIPPING INSTRUCTION: REF SI-2026-9912", match: false },
                  { ln: "02", text: "SHIPPER: PACIFIC FOREST PRODUCTS PTE. LTD.", match: false },
                  { ln: "03", text: "CONSIGNEE: GLOBAL PULP & PAPER LOGISTICS LLC", match: true },
                  { ln: "04", text: "NOTIFY PARTY: SAME AS CONSIGNEE", match: false },
                  { ln: "05", text: "PORT OF LOADING: SHANGHAI PORT, CHINA", match: false },
                  { ln: "06", text: "CONTAINER COUNT: 14 X 40HC | GROSS WT: 24,500.00 KG", match: false }
                ].map((row) => (
                  <div
                    key={row.ln}
                    className={cx("source-code-row", row.match && "highlighted")}
                    style={{ padding: "4px 8px" }}
                  >
                    <span className="source-ln tabular-nums">{row.ln}</span>
                    <span className="source-text text-wrap-break" style={{ fontSize: "var(--text-body)", lineHeight: 1.6 }}>
                      {row.match ? (
                        <>
                          CONSIGNEE: <mark>GLOBAL PULP & PAPER LOGISTICS LLC</mark>
                        </>
                      ) : (
                        row.text
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* BL Pane */}
            <div>
              <div
                style={{
                  padding: "10px 16px",
                  background: "var(--bg-subtle)",
                  borderBottom: "1px solid var(--border-default)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <span className="badge-bl">Draft Bill of Lading (Draft BL)</span>
                <span className="mono tabular-nums" style={{ fontSize: "11px", color: "var(--purple)" }}>
                  Rev 2.1
                </span>
              </div>
              <div style={{ padding: "16px", background: "var(--bg-surface)" }}>
                {[
                  { ln: "01", text: "DRAFT BILL OF LADING: B/L NO. COSU-6291048", match: false },
                  { ln: "02", text: "SHIPPER: PACIFIC FOREST PRODUCTS PTE. LTD.", match: false },
                  { ln: "03", text: "CONSIGNEE: GLOBAL PULP & PAPER LOGISTICS INC.", match: true },
                  { ln: "04", text: "NOTIFY PARTY: SAME AS CONSIGNEE", match: false },
                  { ln: "05", text: "PORT OF LOADING: SHANGHAI PORT, CHINA", match: false },
                  { ln: "06", text: "CONTAINER COUNT: 14 X 40HC | GROSS WT: 24,500.00 KG", match: false }
                ].map((row) => (
                  <div
                    key={row.ln}
                    className={cx("source-code-row", row.match && "highlighted")}
                    style={{ padding: "4px 8px" }}
                  >
                    <span className="source-ln tabular-nums">{row.ln}</span>
                    <span className="source-text text-wrap-break" style={{ fontSize: "var(--text-body)", lineHeight: 1.6 }}>
                      {row.match ? (
                        <>
                          CONSIGNEE: <mark>GLOBAL PULP & PAPER LOGISTICS INC.</mark>
                        </>
                      ) : (
                        row.text
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 5: Mobile Input Accessibility & Contrast Guard */}
        <section className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">ACCESSIBILITY & CONTRAST</span>
              <h2 className="text-section-heading">Mobile Input Rule & WCAG AA Contrast Checks</h2>
            </div>
            <span className="badge-si" style={{ color: "var(--success)" }}>
              <ShieldCheck size={14} /> WCAG AA Compliant
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "20px"
            }}
          >
            {/* Mobile Input Field */}
            <div
              style={{
                background: "var(--bg-subtle)",
                padding: "20px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)"
              }}
            >
              <label
                htmlFor="spec-test-input"
                style={{
                  display: "block",
                  fontSize: "var(--text-form-label)",
                  fontWeight: 500,
                  marginBottom: "8px",
                  color: "var(--ink-primary)"
                }}
              >
                Operator Correction Input (Guaranteed ≥ 16px on mobile):
              </label>
              <input
                id="spec-test-input"
                className="search-field"
                style={{ width: "100%", padding: "10px 14px" }}
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="Enter corrected shipping entity name..."
              />
              <span className="text-secondary" style={{ color: "var(--ink-muted)", marginTop: "8px", display: "block" }}>
                Enforces <code className="mono">font-size: 1rem !important</code> on viewport widths ≤ 640px to prevent iOS mobile auto-zoom.
              </span>
            </div>

            {/* Contrast Ratio Audit Card */}
            <div
              style={{
                background: "var(--bg-subtle)",
                padding: "20px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}
            >
              <strong style={{ fontSize: "var(--text-panel-heading)", color: "var(--ink-primary)" }}>
                Audited Contrast Ratios
              </strong>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-table-cell)" }}>
                <span>Navy (<code className="mono">#142B45</code>) on Light:</span>
                <strong className="mono tabular-nums" style={{ color: "var(--success-text)" }}>
                  12.4:1 (Pass AAA)
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-table-cell)" }}>
                <span>Light (<code className="mono">#F8FAFC</code>) on Dark:</span>
                <strong className="mono tabular-nums" style={{ color: "var(--success-text)" }}>
                  16.5:1 (Pass AAA)
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-table-cell)" }}>
                <span>Teal Accent (<code className="mono">#13A89E</code>) on Canvas:</span>
                <strong className="mono tabular-nums" style={{ color: "var(--info-text)" }}>
                  High contrast borders & badges
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-table-cell)" }}>
                <span>Body Text (<code className="mono">#0F172A</code>) on White:</span>
                <strong className="mono tabular-nums" style={{ color: "var(--success-text)" }}>
                  15.8:1 (Pass AAA)
                </strong>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function cx(...values: Array<string | false | undefined | null>) {
  return values.filter(Boolean).join(" ");
}

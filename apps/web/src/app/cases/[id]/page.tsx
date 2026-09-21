"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Check, CheckCircle2, Copy, Download, FileSearch, History,
  Info, LoaderCircle, RefreshCw, TriangleAlert, Upload, X
} from "lucide-react";
import { caseDetails as initialCaseDetails } from "../../../data/mockData";
import type { CaseDetail, FindingStatus } from "../../../types";
import { useToast } from "../../../components/Toast";
import { ArbitrationPanel } from "../../../components/ArbitrationPanel";
import { Button, StatusBadge } from "../../../components/UI";
import { apiClient } from "../../../api/client";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

export default function CaseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const id = (params?.id as string) || "case-1042";
  const [detail, setDetail] = useState<CaseDetail>(
    () => initialCaseDetails[id] ?? initialCaseDetails["case-1042"]
  );
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const mismatch = (initialCaseDetails[id] ?? initialCaseDetails["case-1042"]).fields.find(
      (f) => f.status !== "OK"
    );
    return mismatch ? mismatch.key : "consignee";
  });
  const [alertVisible, setAlertVisible] = useState(true);
  const [correcting, setCorrecting] = useState(false);
  const [correctionValue, setCorrectionValue] = useState("");
  const [resolvingArbitration, setResolvingArbitration] = useState(false);
  const [arbitrationError, setArbitrationError] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState(1);
  const [savingDraft, setSavingDraft] = useState(false);
  const [previewing, setPreviewing] = useState<"si" | "bl" | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [selectedSiDocumentId, setSelectedSiDocumentId] = useState<string | undefined>();
  const [selectedBlDocumentId, setSelectedBlDocumentId] = useState<string | undefined>();

  // Live data when the API is reachable; the fixture keeps the workspace
  // usable on a clean machine with nothing running. A failed fetch is silent
  // by design here (same fallback pattern as the inbox and imports pages) -
  // the one place staleness cannot be silent is arbitration resolution below,
  // which talks to the API directly and surfaces its own errors.
  useEffect(() => {
    let cancelled = false;
    apiClient.getCase(id).then((live) => {
      if (!cancelled) setDetail(live);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [id]);

  const currentField = detail.fields.find((f) => f.key === selectedKey) ?? detail.fields[0];

  // Falls back to a local-only mutation, clearly labeled as not persisted,
  // only when the API cannot be reached at all - the same rule the
  // arbitration panel follows. A real rejection from a reachable server
  // (stale version, unknown field) is surfaced, never papered over.
  const applyReviewLocally = (mutate: (f: CaseDetail["fields"][number]) => CaseDetail["fields"][number]) => {
    setDetail((prev) => {
      const updatedFields = prev.fields.map((f) => (f.key === selectedKey ? mutate(f) : f));
      const openDiffs = updatedFields.filter((f) => f.status === "MISMATCH").length;
      return { ...prev, fields: updatedFields, confirmedDifferences: openDiffs, state: openDiffs === 0 ? "Complete" : "Needs review" };
    });
  };

  const submitReview = (
    action: "confirm_finding" | "correct_reading" | "cannot_read",
    correctedReading: string | undefined,
    fallback: () => void,
    successMessage: (persisted: boolean) => string
  ) => {
    setSubmittingReview(true);
    apiClient
      .submitReview(detail.id, { action, field: selectedKey, side: "bl", correctedReading, caseVersion: detail.caseVersion })
      .then(({ case: updated }) => {
        setDetail(updated);
        toast(successMessage(true), "success");
      })
      .catch((err) => {
        const apiErr = err as { code?: string; message?: string };
        if (apiErr.code === "stale_case") {
          toast(`Could not submit: this case changed since it was loaded (${apiErr.message ?? "stale version"}). Reload and try again.`, "warning");
          return;
        }
        fallback();
        toast(`${successMessage(false)} - no live backend reachable, not persisted`, "warning");
      })
      .finally(() => setSubmittingReview(false));
  };

  const handleConfirmFinding = () => {
    // Confirming a finding acknowledges it as reviewed - a confirmed mismatch
    // stays a mismatch (per docs/architecture.md and the real /reviews
    // endpoint, which re-runs the same comparison unchanged and only records
    // the review event). It must not silently clear a real defect to OK.
    submitReview(
      "confirm_finding",
      undefined,
      () => applyReviewLocally((f) => ({ ...f, note: `Operator confirmed: ${f.status === "OK" ? "match verified" : "discrepancy is accurate, not a reading error"}` })),
      () => `Field "${currentField.label}" confirmed as reviewed (status unchanged - a confirmed defect remains reported)`
    );
  };

  const handleCorrectReading = () => {
    if (!correctionValue.trim()) {
      setCorrecting(true);
      setCorrectionValue(currentField.blValue);
      return;
    }
    const value = correctionValue;
    submitReview(
      "correct_reading",
      value,
      () => applyReviewLocally((f) => ({ ...f, blValue: value, normalizedBl: value.toLowerCase(), status: "OK" as FindingStatus, note: `Operator corrected reading to: "${value}"` })),
      () => `Field "${currentField.label}" corrected to "${value}"`
    );
    setCorrecting(false);
  };

  const handleMarkUnreadable = () => {
    submitReview(
      "cannot_read",
      undefined,
      () => applyReviewLocally((f) => ({ ...f, status: "NEEDS_REVIEW" as FindingStatus, note: "Marked as unreadable by operator" })),
      () => `Field "${currentField.label}" flagged for escalation`
    );
  };

  const handleExportJson = () => {
    const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(detail, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonStr);
    downloadAnchor.setAttribute("download", `${detail.id}_submission.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast("Exported verification submission JSON file", "success");
  };

  const handleCopyQuotes = () => {
    const quoteText = `SI: "${currentField.siValue}" (${currentField.siEvidence?.locator ?? "N/A"})\nBL: "${currentField.blValue}" (${currentField.blEvidence?.locator ?? "N/A"})`;
    navigator.clipboard.writeText(quoteText);
    toast("Source quotes and locators copied to clipboard");
  };

  const handleRetry = () => {
    setRetrying(true);
    apiClient.retryCase(detail.id)
      .then(async ({ runId }) => {
        toast(`Retry started (${runId.slice(0, 12)}…)`, "success");
        const updated = await apiClient.getCase(detail.id);
        setDetail(updated);
      })
      .catch(() => toast("Retry unavailable · no live backend reachable; nothing was persisted", "warning"))
      .finally(() => setRetrying(false));
  };

  const handleUpload = (file: File) => {
    setUploading(true);
    const roleHint = /si/i.test(file.name) ? "si" : /bl|bill/i.test(file.name) ? "bl" : undefined;
    apiClient.uploadDocument(detail.id, file, roleHint, detail.caseVersion)
      .then(async () => {
        toast(`Uploaded ${file.name}; source is now available to pair`, "success");
        const updated = await apiClient.getCase(detail.id);
        setDetail(updated);
      })
      .catch((err) => toast(`Upload not persisted: ${err instanceof Error ? err.message : "API unavailable"}`, "warning"))
      .finally(() => setUploading(false));
  };

  const handleCreateDraft = () => {
    setDrafting(true);
    apiClient.createDraft(detail.id, detail.unresolvedFields > 0 ? "information_request" : "correction_request", detail.runId)
      .then((draft) => {
        setDraftId(draft.id);
        setDraftVersion(draft.version);
        setDraftText(draft.text);
        toast("Draft created locally in the API", "success");
      })
      .catch(() => {
        setDraftId(null);
        setDraftText(`Case ${detail.emailId}\n\nPlease review the outstanding finding and provide the source document or requested correction.`);
        toast("API unavailable · draft shown locally and not persisted", "warning");
      });
  };

  const handleSaveDraft = () => {
    if (!draftText || !draftId) return;
    setSavingDraft(true);
    apiClient.updateDraft(draftId, draftText, draftVersion)
      .then((draft) => {
        setDraftVersion(draft.version);
        toast("Draft saved to the API", "success");
      })
      .catch(() => toast("Draft save failed · changes remain only in this page", "warning"))
      .finally(() => setSavingDraft(false));
  };

  const handlePreview = (side: "si" | "bl") => {
    const document = side === "si" ? detail.siDocument : detail.blDocument;
    if (!document.id) {
      toast("Source preview unavailable for offline fixture documents", "warning");
      return;
    }
    setPreviewing(side);
    apiClient.getSourcePreview(document.id)
      .then((preview) => setPreviewText(preview.blocks.map((block) => block.text).join("\n\n") || "No readable blocks returned."))
      .catch(() => toast("Could not load source preview", "warning"))
      .finally(() => setPreviewing(null));
  };

  const handleSelectPair = () => {
    if (!selectedSiDocumentId && !selectedBlDocumentId) {
      toast("Select at least one API document before saving a pair", "warning");
      return;
    }
    apiClient.selectPair(detail.id, {
      siDocumentId: selectedSiDocumentId,
      blDocumentId: selectedBlDocumentId,
      expectedCaseVersion: detail.caseVersion
    })
      .then(({ caseVersion }) => {
        setDetail((prev) => ({ ...prev, caseVersion }));
        toast("Document pair selection saved", "success");
      })
      .catch(() => toast("Pair selection failed · no live backend reachable", "warning"));
  };

  return (
    <div className="content-wrap case-page">
      <div className="case-header-wrap">
        <div>
          <Link href="/inbox" className="back-link">
            <ArrowLeft size={14} /> Back to inbox queue
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "4px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: 800 }}>{detail.subject}</h1>
            <StatusBadge status={detail.state} />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginTop: "6px",
              fontSize: "12px",
              color: "var(--ink-muted)"
            }}
          >
            <span className="mono" style={{ color: "var(--primary)", fontWeight: 600 }}>
              {detail.emailId}
            </span>
            <span>·</span>
            <span>{detail.sender}</span>
            <span>·</span>
            <span>Received {detail.receivedAt}</span>
          </div>
        </div>

        <div className="page-actions">
          <Button
            variant="secondary"
            icon={<History size={15} />}
            onClick={() => router.push(`/cases/${detail.id}/history`)}
          >
            Audit history
          </Button>
          <Button variant="secondary" icon={<RefreshCw size={15} className={retrying ? "spin" : undefined} />} onClick={handleRetry} disabled={retrying}>
            {retrying ? "Retrying…" : "Retry run"}
          </Button>
          <Button variant="secondary" icon={<FileSearch size={15} />} onClick={handleCreateDraft} disabled={drafting}>
            {drafting ? "Draft ready" : "Create draft"}
          </Button>
          <label className="btn btn-secondary" style={{ cursor: uploading ? "wait" : "pointer" }}>
            {uploading ? <LoaderCircle size={15} className="spin" /> : <Upload size={15} />}
            {uploading ? "Uploading…" : "Upload source"}
            <input type="file" accept=".pdf,.txt,.docx,.xlsx" style={{ display: "none" }} disabled={uploading} onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) handleUpload(file);
              event.currentTarget.value = "";
            }} />
          </label>
          <Button variant="primary" icon={<Download size={15} />} onClick={handleExportJson}>
            Export JSON
          </Button>
        </div>
      </div>

      {/* An unsettled category outranks the comparison: if the routing is
          wrong, the comparison underneath it answered the wrong question. */}
      {detail.arbitration && (
        <ArbitrationPanel
          arbitration={detail.arbitration}
          resolving={resolvingArbitration}
          error={arbitrationError}
          onResolve={async (category) => {
            setArbitrationError(null);
            setResolvingArbitration(true);
            try {
              // The chosen answer must actually cause its stated consequence:
              // this calls the real endpoint, which re-runs the comparison
              // stage under the confirmed category rather than just labelling
              // the case. See POST /cases/{id}/arbitration in api.py.
              const result = await apiClient.resolveArbitration(
                detail.id, category, detail.caseVersion, "operator confirmed via arbitration panel"
              );
              setDetail((prev) => ({
                ...prev,
                arbitration: null,
                category: result.category as CaseDetail["category"],
                state: result.state,
                caseVersion: result.caseVersion
              }));
              toast(`Category confirmed as ${category.replace(/_/g, " ")} · comparison re-run (${result.verification})`, "success");
            } catch (err) {
              const apiErr = err as { code?: string; message?: string };
              if (apiErr.code === "stale_case" || apiErr.code === "category_not_offered") {
                // The server was reached and refused the request - surface
                // that plainly rather than papering over it locally.
                const message = apiErr.message ?? "The server rejected this resolution.";
                setArbitrationError(message);
                toast(`Could not resolve: ${message}`, "warning");
              } else {
                // No live backend reachable for this case (e.g. the
                // clean-machine fixture demo). Apply the decision locally so
                // the workspace stays usable, but say so - this is not the
                // same as a resolution actually persisting server-side.
                setDetail((prev) => ({
                  ...prev,
                  arbitration: null,
                  category: category as CaseDetail["category"],
                  state: category === "BL_COMPARISON" ? "Needs review" : "Complete"
                }));
                toast(`No live backend reachable · applied "${category.replace(/_/g, " ")}" locally, not persisted`, "warning");
              }
            } finally {
              setResolvingArbitration(false);
            }
          }}
        />
      )}

      <div className="card" style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        <div className="card-heading">
          <div><span className="eyebrow">SOURCE CONTROLS</span><h3>Document pair and previews</h3></div>
          <span className="mono" style={{ fontSize: "11px", color: "var(--ink-faint)" }}>case v{detail.caseVersion}</span>
        </div>
        {detail.documents && detail.documents.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <label style={{ fontSize: "12px", color: "var(--ink-muted)" }}>SI document
              <select className="search-field" style={{ display: "block", width: "100%", marginTop: "5px" }} value={selectedSiDocumentId ?? detail.siDocument.id ?? ""} onChange={(event) => setSelectedSiDocumentId(event.target.value || undefined)}>
                <option value="">Select SI document</option>
                {detail.documents.map((document) => <option key={document.id ?? document.name} value={document.id}>{document.name} · {document.version}</option>)}
              </select>
            </label>
            <label style={{ fontSize: "12px", color: "var(--ink-muted)" }}>BL document
              <select className="search-field" style={{ display: "block", width: "100%", marginTop: "5px" }} value={selectedBlDocumentId ?? detail.blDocument.id ?? ""} onChange={(event) => setSelectedBlDocumentId(event.target.value || undefined)}>
                <option value="">Select BL document</option>
                {detail.documents.map((document) => <option key={document.id ?? document.name} value={document.id}>{document.name} · {document.version}</option>)}
              </select>
            </label>
          </div>
        ) : <p style={{ fontSize: "12px", color: "var(--ink-muted)" }}>Document IDs are not available in offline fixture mode. Upload a source after connecting to the API.</p>}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={handleSelectPair} disabled={!detail.documents?.length}>Save pair selection</Button>
          <Button variant="ghost" onClick={() => handlePreview("si")} disabled={previewing !== null}>{previewing === "si" ? "Loading SI…" : "Preview SI"}</Button>
          <Button variant="ghost" onClick={() => handlePreview("bl")} disabled={previewing !== null}>{previewing === "bl" ? "Loading BL…" : "Preview BL"}</Button>
        </div>
        {previewText && <pre style={{ maxHeight: "180px", overflow: "auto", margin: 0, padding: "12px", background: "var(--bg-subtle)", borderRadius: "var(--radius-md)", whiteSpace: "pre-wrap", fontSize: "11px", color: "var(--ink-secondary)" }}>{previewText}</pre>}
      </div>

      {draftText !== null && (
        <div className="card" style={{ marginTop: "12px" }}>
          <div className="card-heading"><div><span className="eyebrow">LOCAL DRAFT</span><h3>Review response</h3></div><span className="status-badge info">{draftId ? "API draft" : "Not persisted"}</span></div>
          <textarea value={draftText} onChange={(event) => setDraftText(event.target.value)} style={{ width: "100%", minHeight: "120px", marginTop: "10px", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", padding: "10px", fontFamily: "inherit", fontSize: "12px", background: "var(--bg-surface)", color: "var(--ink-primary)" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}><Button variant="primary" onClick={handleSaveDraft} disabled={!draftId || savingDraft}>{savingDraft ? "Saving…" : `Save draft v${draftVersion}`}</Button></div>
        </div>
      )}

      {/* Case Alert Banner */}
      {alertVisible && !detail.arbitration && (
        <div className="case-alert-banner">
          <TriangleAlert size={18} style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: "13px" }}>
            <strong>
              {detail.confirmedDifferences} confirmed discrepancy
              {detail.confirmedDifferences !== 1 ? "ies" : ""}
            </strong>
            <p style={{ margin: "2px 0 0", opacity: 0.9 }}>
              Review the highlighted source passages below before approving the final draft bill of lading.
            </p>
          </div>
          <button
            className="icon-btn"
            style={{ width: "28px", height: "28px" }}
            onClick={() => setAlertVisible(false)}
            aria-label="Dismiss alert"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* 3-Column Workspace */}
      <div className="case-workspace-grid">
        {/* Left Column: 7 Fields Comparison */}
        <section className="workspace-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow" style={{ fontSize: "10px" }}>
                FIELD COMPARISON
              </span>
              <h2>Seven Required Fields</h2>
            </div>
            <span style={{ fontSize: "11px", color: "var(--ink-faint)" }}>Pair v2</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {detail.fields.map((field) => (
              <button
                key={field.key}
                className={cx("field-item", selectedKey === field.key && "selected")}
                onClick={() => setSelectedKey(field.key)}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "var(--text-table-head)", fontWeight: 600, color: "var(--ink-primary)" }}>
                    {field.label}
                  </span>
                  <span className="mono tabular-nums text-wrap-break" style={{ fontSize: "var(--text-secondary)", color: "var(--ink-muted)" }}>
                    {field.blValue}
                  </span>
                </div>
                <StatusBadge status={field.status} />
              </button>
            ))}
          </div>

          <div
            style={{
              padding: "14px 18px",
              borderTop: "1px solid var(--border-default)",
              fontSize: "var(--text-secondary)",
              display: "flex",
              gap: "12px",
              color: "var(--ink-muted)"
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <Check size={12} className="success-text" /> Match
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <X size={12} className="danger-text" /> Mismatch
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <TriangleAlert size={12} className="warning-text" /> Needs review
            </span>
          </div>
        </section>

        {/* Middle Column: Dual Synchronized Evidence Viewer */}
        <section className="workspace-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">
                EVIDENCE LOCATOR
              </span>
              <h2>{currentField.label}</h2>
            </div>
            <Button variant="secondary" icon={<Copy size={13} />} onClick={handleCopyQuotes}>
              Copy quotes
            </Button>
          </div>

          <div className="evidence-dual-view">
            {/* SI Source Pane */}
            <div className="evidence-pane">
              <div className="evidence-pane-head">
                <span className="badge-si">SI Reference</span>
                <span className="mono tabular-nums" style={{ fontSize: "var(--text-secondary)", color: "var(--primary)" }}>
                  {detail.siDocument.version}
                </span>
              </div>
              <div className="evidence-source-body">
                {detail.siSource.map((line, idx) => {
                  const isHighlighted = line.includes(currentField.siValue) && currentField.siValue !== "";
                  return (
                    <div key={idx} className={cx("source-code-row", isHighlighted && "highlighted")}>
                      <span className="source-ln tabular-nums">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="source-text text-wrap-break" style={{ fontSize: "var(--text-body)", lineHeight: 1.6 }}>
                        {isHighlighted ? (
                          <>
                            {line.split(currentField.siValue)[0]}
                            <mark>{currentField.siValue}</mark>
                            {line.split(currentField.siValue).slice(1).join(currentField.siValue)}
                          </>
                        ) : (
                          line || " "
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* BL Source Pane */}
            <div className="evidence-pane">
              <div className="evidence-pane-head">
                <span className="badge-bl">Draft BL</span>
                <span className="mono tabular-nums" style={{ fontSize: "var(--text-secondary)", color: "var(--purple)" }}>
                  {detail.blDocument.version}
                </span>
              </div>
              <div className="evidence-source-body">
                {detail.blSource.map((line, idx) => {
                  const isHighlighted = line.includes(currentField.blValue) && currentField.blValue !== "";
                  return (
                    <div key={idx} className={cx("source-code-row", isHighlighted && "highlighted")}>
                      <span className="source-ln tabular-nums">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="source-text text-wrap-break" style={{ fontSize: "var(--text-body)", lineHeight: 1.6 }}>
                        {isHighlighted ? (
                          <>
                            {line.split(currentField.blValue)[0]}
                            <mark>{currentField.blValue}</mark>
                            {line.split(currentField.blValue).slice(1).join(currentField.blValue)}
                          </>
                        ) : (
                          line || " "
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>


        {/* Right Column: Operator Decision Drawer */}
        <aside className="workspace-panel decision-panel">
          <div className="panel-head" style={{ padding: "0 0 12px 0" }}>
            <div>
              <span className="eyebrow" style={{ fontSize: "10px" }}>
                DECISION DRAWER
              </span>
              <h2>
                {currentField.status === "OK"
                  ? "Field Confirmed"
                  : currentField.status === "MISSING"
                  ? "Missing Value"
                  : "Resolve Finding"}
              </h2>
            </div>
          </div>

          {currentField.status === "OK" ? (
            <div
              style={{
                background: "var(--success-subtle)",
                border: "1px solid var(--success-border)",
                padding: "16px",
                borderRadius: "var(--radius-md)"
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "var(--success-text)",
                  fontWeight: 700
                }}
              >
                <CheckCircle2 size={18} />
                <span>Values Match</span>
              </div>
              <p style={{ fontSize: "12px", color: "var(--success-text)", marginTop: "6px" }}>
                SI and BL source values are verified identical. No further reviewer intervention required.
              </p>
            </div>
          ) : (
            <>
              <div
                style={{
                  background: "var(--bg-subtle)",
                  padding: "14px",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-default)"
                }}
              >
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <TriangleAlert
                    size={17}
                    className="warning-text"
                    style={{ flexShrink: 0, marginTop: "2px" }}
                  />
                  <p style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--ink-primary)" }}>
                    {detail.reviewQuestion ?? "Consignee legal name differs between SI and draft BL."}
                  </p>
                </div>
                {currentField.note && (
                  <p style={{ fontSize: "11.5px", color: "var(--ink-muted)", marginTop: "8px" }}>
                    Reason: {currentField.note}
                  </p>
                )}
              </div>

              {correcting && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <label style={{ fontSize: "12px", fontWeight: 600 }}>Corrected Reading Value:</label>
                  <input
                    className="search-field"
                    style={{ width: "100%" }}
                    value={correctionValue}
                    onChange={(e) => setCorrectionValue(e.target.value)}
                    placeholder="Enter correct text..."
                  />
                </div>
              )}

              <div className="decision-actions">
                <Button variant="primary" icon={<Check size={15} />} onClick={handleConfirmFinding} disabled={submittingReview}>
                  Confirm finding
                </Button>
                <Button
                  variant="secondary"
                  icon={<FileSearch size={15} />}
                  onClick={handleCorrectReading}
                  disabled={submittingReview}
                >
                  {correcting ? "Save corrected reading" : "Correct reading"}
                </Button>
                <Button variant="ghost" onClick={handleMarkUnreadable} disabled={submittingReview}>
                  Cannot read / Escalate
                </Button>
              </div>
            </>
          )}

          <div
            style={{
              display: "flex",
              gap: "8px",
              fontSize: "11px",
              color: "var(--ink-faint)",
              borderTop: "1px solid var(--border-default)",
              paddingTop: "12px"
            }}
          >
            <Info size={14} style={{ flexShrink: 0 }} />
            <span>
              Decisions generate an immutable assisted audit trail while preserving raw machine output.
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

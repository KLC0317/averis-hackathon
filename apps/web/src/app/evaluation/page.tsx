"use client";

import React, { useEffect, useState } from "react";
import {
  CheckCircle2, ClipboardList, Clock3, Download, FileCheck2, RefreshCw,
  ShieldQuestion, TriangleAlert
} from "lucide-react";
import { apiClient, type EvaluationStatus, type Metrics } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, MetricCard, PageHeader } from "../../components/UI";

const EMPTY_METRICS: Metrics = {
  importId: null, cases: 0, comparisons: 0, needsReview: 0,
  needsClassificationReview: 0, complete: 0, confirmedDifferences: 0,
  unresolvedFields: 0, categoryCounts: {}
};

/**
 * This page shows only what the application can actually compute: real
 * counts from the current import, and the real (isolated) evaluator status.
 * It never displays a score, because scoring requires the organizer's
 * private reference set, which this application deliberately never has
 * access to - see decision log: "never invented scores."
 */
export default function EvaluationPage() {
  const { toast } = useToast();
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const [metricsLoaded, setMetricsLoaded] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationStatus | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    apiClient
      .getMetrics()
      .then((m) => {
        setMetrics(m);
        setMetricsLoaded(true);
      })
      .catch(() => setMetricsLoaded(false));
  }, []);

  const checkEvaluator = () => {
    setChecking(true);
    apiClient
      .getEvaluation()
      .then((status) => {
        setEvaluation(status);
        toast(
          status.available ? "Evaluator returned a score" : `Evaluator: ${status.status.replace(/_/g, " ")}`,
          status.available ? "success" : "info"
        );
      })
      .catch(() => {
        setEvaluation({ available: false, status: "UNREACHABLE", message: "Could not reach the API." });
        toast("Could not reach the evaluation endpoint", "warning");
      })
      .finally(() => setChecking(false));
  };

  const handleDownloadReport = () => {
    const report = {
      generated_at: new Date().toISOString(),
      import_id: metrics.importId,
      operational_metrics: metrics,
      organizer_evaluation: evaluation ?? { available: false, status: "NOT_CHECKED", message: "Evaluator was not queried before export." }
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cleardraft_run_report.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Run report downloaded (operational metrics + evaluator status, no invented score)");
  };

  return (
    <div className="content-wrap">
      <PageHeader
        eyebrow="QUALITY REPORTING"
        title="Evaluation"
        description="Operational counts this application can compute directly, and the real status of the organizer's isolated evaluator. No score is shown unless the organizer actually returns one."
        actions={
          <>
            <Button variant="secondary" icon={<ShieldQuestion size={15} />} onClick={checkEvaluator} disabled={checking}>
              {checking ? "Checking…" : "Check evaluator"}
            </Button>
            <Button variant="primary" icon={<Download size={15} />} onClick={handleDownloadReport}>
              Download report
            </Button>
          </>
        }
      />

      {!metricsLoaded && (
        <div className="callout" style={{ marginBottom: 20 }}>
          <TriangleAlert size={16} />
          <span>
            Could not reach the API - showing zero counts. Start the backend and import a bundle to see real numbers here.
          </span>
        </div>
      )}

      <div className="eval-status-banner">
        <span className="eval-status-icon">
          {evaluation?.available ? <CheckCircle2 size={18} /> : <Clock3 size={18} />}
        </span>
        <div>
          <span className="eyebrow">ORGANIZER EVALUATOR</span>
          <h2>
            {evaluation
              ? evaluation.available
                ? "Score available"
                : evaluation.status.replace(/_/g, " ")
              : "Not checked yet"}
          </h2>
          <p>
            {evaluation
              ? evaluation.message || "The organizer evaluator is isolated from this application by design; no reference answers are ever loaded into it."
              : 'Click "Check evaluator" to ask the real /evaluations endpoint. It legitimately returns "not available" until an export is submitted to the organizer outside this app - that response is not an error.'}
          </p>
        </div>
      </div>

      <div className="metrics-row">
        <MetricCard label="Emails processed" value={String(metrics.cases)} hint={metrics.importId ? `Import ${metrics.importId.slice(0, 8)}…` : "No import selected"} icon={<ClipboardList size={16} />} />
        <MetricCard label="Comparisons" value={String(metrics.comparisons)} hint="Classified BL_COMPARISON" icon={<FileCheck2 size={16} />} />
        <MetricCard label="Complete" value={String(metrics.complete)} hint="No open findings" icon={<CheckCircle2 size={16} />} tone="success" />
        <MetricCard label="Needs review" value={String(metrics.needsReview + metrics.needsClassificationReview)} hint={`${metrics.needsReview} findings, ${metrics.needsClassificationReview} category`} icon={<TriangleAlert size={16} />} tone="warning" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: "20px" }}>
        <div className="card">
          <div className="card-heading">
            <h3>Category distribution (this import)</h3>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "12px" }}>
            {Object.entries(metrics.categoryCounts).length === 0 && (
              <p style={{ color: "var(--ink-muted)", fontSize: 12 }}>No cases yet - import a bundle and run the pipeline.</p>
            )}
            {Object.entries(metrics.categoryCounts).map(([category, count]) => {
              const pct = metrics.cases > 0 ? (count / metrics.cases) * 100 : 0;
              return (
                <div key={category}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                    <span>{category.replace(/_/g, " ")}</span>
                    <span className="mono">{count} ({pct.toFixed(1)}%)</span>
                  </div>
                  <div style={{ height: 8, background: "var(--bg-subtle)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: "var(--primary)", borderRadius: "var(--radius-full)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <div className="card-heading">
            <h3>Why there's no score here</h3>
          </div>
          <p style={{ fontSize: 12, color: "var(--ink-muted)", lineHeight: 1.6, marginTop: 12 }}>
            Scoring requires the organizer&apos;s private reference answers, which this application
            never loads - not into the pipeline, not into this page. The counts above are computed
            directly from this run and are exact. The one number this page cannot show honestly is
            an accuracy percentage, because that number does not exist inside this application.
          </p>
          <p style={{ fontSize: 12, color: "var(--ink-muted)", lineHeight: 1.6, marginTop: 10 }}>
            Submit the exported machine-only JSON to the organizer&apos;s scoring endpoint separately,
            then check back here - a real score will show once the evaluator actually returns one.
          </p>
        </div>
      </div>
    </div>
  );
}

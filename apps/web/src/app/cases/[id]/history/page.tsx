"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, FileInput, RefreshCw, TriangleAlert, Upload } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { caseDetails as fixtureCaseDetails } from "../../../../data/mockData";
import type { CaseDetail, ReviewEvent } from "../../../../types";
import { apiClient } from "../../../../api/client";
import { useToast } from "../../../../components/Toast";
import { Button, StatusBadge } from "../../../../components/UI";

function formatEventTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function actionLabel(action: string) {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function eventDescription(event: ReviewEvent) {
  const field = event.field ? ` for ${event.field.replace(/_/g, " ")}` : "";
  if (event.oldValue || event.newValue) {
    return `${event.oldValue ?? "No previous value"} → ${event.newValue ?? "No replacement value"}${event.reason ? ` · ${event.reason}` : ""}`;
  }
  return event.reason || `Recorded ${actionLabel(event.action).toLowerCase()}${field}.`;
}

function eventIcon(event: ReviewEvent) {
  if (event.action.includes("resolve") || event.action.includes("confirm")) {
    return <CheckCircle2 size={15} className="success-text" />;
  }
  if (event.action.includes("cannot") || event.action.includes("retry")) {
    return <TriangleAlert size={15} className="warning-text" />;
  }
  if (event.action.includes("document") || event.action.includes("pair")) {
    return <Upload size={15} style={{ color: "var(--primary)" }} />;
  }
  return <FileInput size={15} style={{ color: "var(--ink-faint)" }} />;
}

export default function HistoryPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const requestedId = (params?.id as string) || "case-1042";
  const fixture = fixtureCaseDetails[requestedId] ?? fixtureCaseDetails["case-1042"];
  const [detail, setDetail] = useState<CaseDetail>(fixture);
  const [events, setEvents] = useState<ReviewEvent[]>([]);
  const [liveConnected, setLiveConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = (announce = false) => {
    setRefreshing(true);
    return Promise.all([apiClient.getCase(requestedId), apiClient.getCaseHistory(requestedId)])
      .then(([live, history]) => {
        setDetail(live);
        setEvents(history.reviewEvents);
        setLiveConnected(true);
        if (announce) toast("Audit history refreshed from the API", "success");
      })
      .catch(() => {
        // Offline mode is deliberate: never invent audit events when the API
        // cannot be reached. The fixture is clearly labelled below instead.
        setDetail(fixture);
        setEvents([]);
        setLiveConnected(false);
        if (announce) toast("API unavailable · showing fixture metadata; no audit events were inferred", "warning");
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([apiClient.getCase(requestedId), apiClient.getCaseHistory(requestedId)])
      .then(([live, history]) => {
        if (cancelled) return;
        setDetail(live);
        setEvents(history.reviewEvents);
        setLiveConnected(true);
      })
      .catch(() => {
        if (cancelled) return;
        setDetail(fixture);
        setEvents([]);
        setLiveConnected(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestedId]);

  const eventCountLabel = useMemo(() => `${events.length} recorded event${events.length === 1 ? "" : "s"}`, [events.length]);

  const handleExportAudit = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      source: liveConnected ? "api" : "offline_fixture",
      case: detail,
      reviewEvents: events
    };
    const jsonStr = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonStr);
    downloadAnchor.setAttribute("download", `${detail.id}_audit_trail.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast(liveConnected ? "API audit log exported" : "Offline fixture metadata exported; no live events included", liveConnected ? "success" : "warning");
  };

  if (loading) {
    return (
      <div className="content-wrap">
        <div className="card" style={{ padding: "28px", color: "var(--ink-muted)" }}>Loading audit history from the API…</div>
      </div>
    );
  }

  return (
    <div className="content-wrap">
      <div className="case-header-wrap">
        <div>
          <button className="back-link" onClick={() => router.push(`/cases/${detail.id}`)}>
            <ArrowLeft size={14} /> Back to case workspace
          </button>
          <h1 style={{ fontSize: "var(--text-page-title)", fontWeight: 700, letterSpacing: "-0.035em" }}>Audit <span className="title-gradient-accent">History</span></h1>
          <div style={{ display: "flex", gap: "10px", fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px" }}>
            <span className="mono" style={{ color: "var(--primary)", fontWeight: 600 }}>{detail.emailId}</span>
            <span>·</span>
            <span>{detail.subject}</span>
          </div>
        </div>

        <div className="page-actions">
          <Button
            variant="secondary"
            icon={<RefreshCw size={15} className={refreshing ? "spin" : undefined} />}
            onClick={() => loadHistory(true)}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button variant="primary" icon={<Download size={15} />} onClick={handleExportAudit}>
            Export audit log
          </Button>
        </div>
      </div>

      {!liveConnected && (
        <div className="callout" style={{ marginBottom: 20 }}>
          <TriangleAlert size={16} />
          <span>API unavailable — showing local fixture metadata. Audit events are not available offline and were not fabricated.</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: "20px", marginTop: "10px" }}>
        <div className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">APPEND-ONLY REVIEW EVENTS</span>
              <h3>Decision &amp; Parser History</h3>
            </div>
            <span className={`status-badge ${liveConnected ? "info" : "muted"}`}>{eventCountLabel}</span>
          </div>

          {events.length === 0 ? (
            <div style={{ marginTop: "18px", padding: "18px", border: "1px dashed var(--border-default)", borderRadius: "var(--radius-md)", color: "var(--ink-muted)", fontSize: "12px" }}>
              {liveConnected
                ? "The API has not recorded a review event for this case yet. Import, parser, and comparison milestones are not guessed here."
                : "No live audit events can be loaded while offline. Reconnect to the API to inspect the append-only event stream."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginTop: "16px" }}>
              {events.map((event) => (
                <div key={event.id} style={{ display: "flex", gap: "14px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "var(--radius-full)", background: "var(--bg-subtle)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    {eventIcon(event)}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "13px", color: "var(--ink-primary)" }}>{actionLabel(event.action)}</strong>
                      <span className="mono" style={{ fontSize: "11px", color: "var(--ink-faint)" }}>{formatEventTime(event.createdAt)}</span>
                    </div>
                    <span className="mono" style={{ fontSize: "11px", color: "var(--ink-faint)" }}>
                      {event.id.slice(0, 12)}{event.runId ? ` · run ${event.runId.slice(0, 12)}` : ""}
                    </span>
                    <p style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px", overflowWrap: "anywhere" }}>{eventDescription(event)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card-heading">
            <h3>Document Pair</h3>
            {liveConnected ? <StatusBadge status={detail.state} /> : <span className="status-badge muted">Offline fixture</span>}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[{ label: "SI reference", document: detail.siDocument }, { label: "Draft BL", document: detail.blDocument }].map(({ label, document }) => (
              <div key={label} style={{ padding: "12px", background: "var(--bg-subtle)", borderRadius: "var(--radius-md)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ fontSize: "12px", display: "block", overflowWrap: "anywhere" }}>{label}: {document.name}</strong>
                  <span className="mono" style={{ fontSize: "11px", color: label === "SI reference" ? "var(--primary)" : "var(--purple)" }}>{document.version}</span>
                  <span style={{ display: "block", fontSize: "11px", color: "var(--ink-faint)", marginTop: "3px" }}>{document.updated}</span>
                </div>
                {liveConnected ? <CheckCircle2 size={16} style={{ color: "var(--ink-faint)", flexShrink: 0 }} /> : <TriangleAlert size={16} className="warning-text" style={{ flexShrink: 0 }} />}
              </div>
            ))}
          </div>

          <div style={{ padding: "12px", background: "var(--info-subtle)", borderRadius: "var(--radius-md)", border: "1px solid var(--info-border)", fontSize: "12px", color: "var(--info-text)" }}>
            {liveConnected
              ? "Pair and source metadata are read from the case API. Historical review events remain pinned to the versions recorded by the server."
              : "These document details come from the local fixture only. Reconnect before treating the pair or versions as authoritative."}
          </div>
        </div>
      </div>
    </div>
  );
}

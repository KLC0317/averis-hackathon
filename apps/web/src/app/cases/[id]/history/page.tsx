"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, CheckCircle2, Download, FileInput, TriangleAlert, Upload
} from "lucide-react";
import { caseDetails as initialCaseDetails } from "../../../../data/mockData";
import { useToast } from "../../../../components/Toast";
import { Button } from "../../../../components/UI";

export default function HistoryPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const id = (params?.id as string) || "case-1042";
  const detail = initialCaseDetails[id] ?? initialCaseDetails["case-1042"];

  const handleExportAudit = () => {
    const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(detail, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonStr);
    downloadAnchor.setAttribute("download", `${detail.id}_audit_trail.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast("Audit log history exported successfully", "success");
  };

  return (
    <div className="content-wrap">
      <div className="case-header-wrap">
        <div>
          <button className="back-link" onClick={() => router.push(`/cases/${detail.id}`)}>
            <ArrowLeft size={14} /> Back to case workspace
          </button>
          <h1 style={{ fontSize: "24px", fontWeight: 800 }}>Audit History</h1>
          <div
            style={{
              display: "flex",
              gap: "10px",
              fontSize: "12px",
              color: "var(--ink-muted)",
              marginTop: "4px"
            }}
          >
            <span className="mono" style={{ color: "var(--primary)", fontWeight: 600 }}>
              {detail.emailId}
            </span>
            <span>·</span>
            <span>{detail.subject}</span>
          </div>
        </div>

        <Button variant="primary" icon={<Download size={15} />} onClick={handleExportAudit}>
          Export audit log
        </Button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 0.7fr",
          gap: "20px",
          marginTop: "10px"
        }}
      >
        <div className="card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">APPEND-ONLY AUDIT EVENTS</span>
              <h3>Decision & Parser History</h3>
            </div>
            <span className="status-badge info">4 recorded events</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px", marginTop: "16px" }}>
            {[
              {
                time: "Today, 09:43",
                title: "Review opened",
                meta: "task_291 · Reviewer assigned",
                desc: "Consignee legal name differs between SI v2 and BL v1. Targeted question generated.",
                icon: <TriangleAlert size={15} className="warning-text" />
              },
              {
                time: "Today, 09:42",
                title: "Machine comparison completed",
                meta: "run_8f31 · deterministic-rules-v0.3",
                desc: "Seven fields compared against SI v2 and BL v1. One confirmed mismatch detected.",
                icon: <CheckCircle2 size={15} className="success-text" />
              },
              {
                time: "Today, 09:40",
                title: "BL Document ingested",
                meta: "version v1 · SHA-256 04c3a8",
                desc: "Raw source PDF parsed and indexed into immutable local storage.",
                icon: <Upload size={15} style={{ color: "var(--primary)" }} />
              },
              {
                time: "Today, 09:40",
                title: "Case record created",
                meta: "imp_20240918_01 · Inbound classification",
                desc: "Email categorized as BL comparison with 98.4% confidence score.",
                icon: <FileInput size={15} style={{ color: "var(--ink-faint)" }} />
              }
            ].map((evt, i) => (
              <div key={i} style={{ display: "flex", gap: "14px" }}>
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "var(--radius-full)",
                    background: "var(--bg-subtle)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0
                  }}
                >
                  {evt.icon}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <strong style={{ fontSize: "13px", color: "var(--ink-primary)" }}>
                      {evt.title}
                    </strong>
                    <span className="mono" style={{ fontSize: "11px", color: "var(--ink-faint)" }}>
                      {evt.time}
                    </span>
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--ink-faint)" }}>{evt.meta}</span>
                  <p style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px" }}>
                    {evt.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card-heading">
            <h3>Document Pair</h3>
            <span className="status-badge success">Verified</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div
              style={{
                padding: "12px",
                background: "var(--bg-subtle)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div>
                <strong style={{ fontSize: "12px", display: "block" }}>
                  {detail.siDocument.name}
                </strong>
                <span className="mono" style={{ fontSize: "11px", color: "var(--primary)" }}>
                  {detail.siDocument.version}
                </span>
              </div>
              <CheckCircle2 size={16} className="success-text" />
            </div>

            <div
              style={{
                padding: "12px",
                background: "var(--bg-subtle)",
                borderRadius: "var(--radius-md)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <div>
                <strong style={{ fontSize: "12px", display: "block" }}>
                  {detail.blDocument.name}
                </strong>
                <span className="mono" style={{ fontSize: "11px", color: "var(--purple)" }}>
                  {detail.blDocument.version}
                </span>
              </div>
              <CheckCircle2 size={16} className="success-text" />
            </div>
          </div>

          <div
            style={{
              padding: "12px",
              background: "var(--info-subtle)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--info-border)",
              fontSize: "12px",
              color: "var(--info-text)"
            }}
          >
            Document changes immediately spawn a new seven-field comparison run. Historical reviews
            remain pinned to their exact source hashes.
          </div>
        </div>
      </div>
    </div>
  );
}

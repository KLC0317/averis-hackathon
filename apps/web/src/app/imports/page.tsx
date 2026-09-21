"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowRight, Copy, Download, FileArchive, Play, RefreshCw, ShieldCheck, Upload
} from "lucide-react";
import { imports as fixtureImports } from "../../data/mockData";
import type { ImportRecord } from "../../types";
import { apiClient } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, PageHeader, StatusBadge } from "../../components/UI";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

export default function ImportsPage() {
  const { toast } = useToast();
  const [dragging, setDragging] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importRows, setImportRows] = useState<ImportRecord[]>(fixtureImports);
  const [liveConnected, setLiveConnected] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [runningImportId, setRunningImportId] = useState<string | null>(null);

  const refreshImports = () => {
    apiClient
      .listImports()
      .then(async (rows) => {
        const bundleRows = rows.filter((r) => r.name !== "mailbox" && (r as any).source_mode !== "mailbox");
        const withMetrics = await Promise.all(
          bundleRows.map(async (row) => {
            try {
              const m = await apiClient.getMetrics(row.id);
              return { ...row, comparisons: m.comparisons, needsReview: m.needsReview + m.needsClassificationReview };
            } catch {
              return row;
            }
          })
        );
        setImportRows(withMetrics);
        setLiveConnected(true);
      })
      .catch(() => setLiveConnected(false));
  };

  useEffect(refreshImports, []);

  const current = liveConnected ? importRows[0] : null;

  const handleUpload = (file: File) => {
    setPendingFile(file);
    setUploading(true);
    apiClient
      .createImport(file)
      .then(() => {
        toast(`Imported ${file.name}`, "success");
        refreshImports();
      })
      .catch((err) => {
        toast(`Could not reach the API to import this file (${err instanceof Error ? err.message : "unknown error"}) - nothing was persisted`, "warning");
      })
      .finally(() => setUploading(false));
  };

  const handleStartRun = () => {
    if (!current) {
      toast("No live import to run - import a bundle first", "warning");
      return;
    }
    setRunningImportId(current.id);
    toast("Pipeline run started (local_rules)…", "info");
    apiClient
      .startRun(current.id, "local_rules")
      .then(async () => {
        const m = await apiClient.getMetrics(current.id);
        toast(`Run complete · ${m.comparisons} comparisons, ${m.complete} clean, ${m.needsReview + m.needsClassificationReview} need review`, "success");
        refreshImports();
      })
      .catch((err) => toast(`Run failed: ${err instanceof Error ? err.message : "unknown error"}`, "warning"))
      .finally(() => setRunningImportId(null));
  };

  return (
    <div className="content-wrap">
      <PageHeader
        title={
          <span>
            Document <span className="title-gradient-accent">Imports</span>
          </span>
        }
        description="Ingest participant bundles, inspect package manifests, and start deterministic comparison runs."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} />}
              onClick={refreshImports}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              icon={<Upload size={16} />}
              onClick={() => {
                const input = document.getElementById("bundle-file-input") as HTMLInputElement;
                input?.click();
              }}
            >
              Import bundle
            </Button>
          </>
        }
      />

      {!liveConnected && (
        <div className="callout" style={{ marginBottom: 20 }}>
          <ShieldCheck size={16} />
          <span>API unreachable - showing example data below. Start the backend to import and run against real data.</span>
        </div>
      )}

      <section className="import-grid">
        <div
          className={cx("drop-card", dragging && "dragging")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) handleUpload(file);
          }}
        >
          <div className="drop-icon-wrap">
            <FileArchive size={26} />
          </div>
          <h2>{uploading ? `Uploading ${pendingFile?.name}…` : pendingFile ? pendingFile.name : "Drop a participant bundle here"}</h2>
          <p>
            {pendingFile
              ? uploading
                ? "Sending to the API…"
                : "Bundle sent - see the manifest to the right."
              : "Drag & drop ZIP archive or click below · Raw source bytes remain immutable"}
          </p>

          <label className="btn btn-secondary">
            <Upload size={15} />
            Browse archive
            <input
              id="bundle-file-input"
              type="file"
              accept=".zip,.tar.gz,.json"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
          </label>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              marginTop: "18px",
              fontSize: "11px",
              color: "var(--ink-faint)"
            }}
          >
            <ShieldCheck size={14} className="success-text" />
            <span>Local SHA-256 validation enabled · No data leaves your machine</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="card">
            <div className="card-heading">
              <div>
                <span className="eyebrow" style={{ fontSize: "10px" }}>
                  {current ? "CURRENT ACTIVE MANIFEST" : "NO LIVE IMPORT"}
                </span>
                <h3>{current ? current.name : "Import a bundle to see its manifest"}</h3>
              </div>
              {current && <StatusBadge status={current.status} />}
            </div>

            <div className="manifest-grid">
              <div>
                <span>Emails</span>
                <strong>{current ? `${current.emails} messages` : "—"}</strong>
              </div>
              <div>
                <span>Attachments</span>
                <strong>{current ? `${current.attachments} files` : "—"}</strong>
              </div>
              <div>
                <span>Import ID</span>
                <strong
                  className="mono"
                  style={current ? { cursor: "pointer", color: "var(--primary)" } : undefined}
                  title={current ? "Click to copy import ID" : undefined}
                  onClick={() => {
                    if (!current) return;
                    navigator.clipboard.writeText(current.id);
                    toast("Import ID copied to clipboard");
                  }}
                >
                  {current ? (
                    <>
                      {current.id.slice(0, 8)}… <Copy size={11} style={{ display: "inline" }} />
                    </>
                  ) : (
                    "—"
                  )}
                </strong>
              </div>
              <div>
                <span>Ingested</span>
                <strong>{current ? current.createdAt : "—"}</strong>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "10px",
                borderTop: "1px solid var(--border-default)",
                paddingTop: "14px"
              }}
            >
              <Button
                variant="primary"
                icon={<Play size={15} />}
                onClick={handleStartRun}
                disabled={!current || runningImportId !== null}
              >
                {runningImportId ? "Running pipeline…" : "Start run"}
              </Button>
              <Button
                variant="secondary"
                icon={<Download size={15} />}
                disabled={!current}
                onClick={() => {
                  if (!current) return;
                  const blob = new Blob([JSON.stringify(current, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${current.id}_manifest.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export manifest
              </Button>
            </div>
          </div>
        </div>
      </section>

      <div className="card-heading" style={{ marginTop: "12px" }}>
        <div>
          <span className="eyebrow">RUN HISTORY</span>
          <h2 style={{ fontSize: "18px", fontWeight: 700 }}>Recent import batches</h2>
        </div>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Import Name & ID</th>
              <th>Created</th>
              <th>Status</th>
              <th>Emails</th>
              <th>Attachments</th>
              <th>Comparisons</th>
              <th>Needs Review</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {importRows.map((item) => (
              <tr key={item.id}>
                <td>
                  <div className="cell-primary">
                    <FileArchive size={18} style={{ color: "var(--primary)" }} />
                    <div className="cell-primary-content">
                      <strong>{item.name}</strong>
                      <span className="mono">{item.id}</span>
                    </div>
                  </div>
                </td>
                <td className="mono" style={{ fontSize: "11px" }}>
                  {item.createdAt}
                </td>
                <td>
                  <StatusBadge status={item.status} />
                </td>
                <td>{item.emails}</td>
                <td>{item.attachments}</td>
                <td>{item.comparisons}</td>
                <td>
                  {item.needsReview > 0 ? (
                    <span className="warning-text" style={{ fontWeight: 600 }}>
                      {item.needsReview}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <ArrowRight size={15} style={{ color: "var(--ink-faint)" }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

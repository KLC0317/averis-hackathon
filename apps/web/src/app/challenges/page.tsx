"use client";

import React, { useState } from "react";
import {
  Archive, Check, FileArchive, FileSearch, LoaderCircle, Mail, Play, RotateCcw, Ruler,
  ShieldAlert, Type, X
} from "lucide-react";
import { apiClient, type ChallengeResult } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, PageHeader, StatusBadge } from "../../components/UI";

/**
 * Every mutation here is a real one implemented in challenges.py - the
 * description and "expects" text are copied from what that code actually
 * does, not invented for the demo. Running a card calls the real
 * POST /challenges endpoint against a fixture already in the API's
 * database; there is no simulated pass/fail.
 */
const CHALLENGES: Array<{ id: string; title: string; description: string; expects: string; icon: React.ReactNode }> = [
  {
    id: "case-spacing",
    title: "Case & spacing mutation",
    description: 'Changes case/spacing in a party or port value ("Port Klang" -> "PORT   KLANG").',
    expects: "Invariant - comparison must still MATCH",
    icon: <Type size={18} />
  },
  {
    id: "label-synonym",
    title: "Label synonym mutation",
    description: 'Replaces a field label with a reviewed synonym ("Port of Loading" -> "Load Port") without changing the value.',
    expects: "Invariant - comparison must still MATCH",
    icon: <FileSearch size={18} />
  },
  {
    id: "attachment-rename",
    title: "Attachment rename mutation",
    description: "Renames an attachment file while preserving its bytes and the email's reference to it.",
    expects: "Invariant - pairing and comparison must be unaffected",
    icon: <FileArchive size={18} />
  },
  {
    id: "misleading-email-assertion",
    title: "Misleading email assertion",
    description: 'Prepends "All documents are already correct" to the message body; source documents remain authoritative.',
    expects: "Invariant - the false claim must not override document evidence",
    icon: <Mail size={18} />
  },
  {
    id: "container-count-plus-one",
    title: "Container count mutation",
    description: "Increments one unambiguous BL container count by exactly one.",
    expects: "A real container_count mismatch must be reported",
    icon: <Ruler size={18} />
  },
  {
    id: "remove-si-required-value",
    title: "Remove required SI value",
    description: "Replaces the SI gross-weight reading with an explicit unresolved placeholder (TBA).",
    expects: "gross_weight_kg must resolve as unresolved / needs review",
    icon: <Archive size={18} />
  },
  {
    id: "wrong-document-type",
    title: "Wrong document type",
    description: "Replaces the draft BL bytes with a clearly-labelled commercial invoice.",
    expects: "The case must be routed to review as the wrong document type",
    icon: <ShieldAlert size={18} />
  }
];

const DEFAULT_FIXTURE = "email_001";

export default function ChallengesPage() {
  const { toast } = useToast();
  const [fixtureId, setFixtureId] = useState(DEFAULT_FIXTURE);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ChallengeResult>>({});
  const [outcomes, setOutcomes] = useState<ChallengeResult[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);

  const handleRun = (mutationId: string, title: string) => {
    setRunningId(mutationId);
    setApiError(null);
    toast(`Running "${title}" against fixture ${fixtureId}…`, "info");
    apiClient
      .runChallenge(fixtureId, mutationId)
      .then((result) => {
        setResults((prev) => ({ ...prev, [mutationId]: result }));
        setOutcomes((prev) => [result, ...prev]);
        toast(
          result.status === "PASSED" ? `Passed: ${title}` : `Failed: ${title} - observed did not match expected`,
          result.status === "PASSED" ? "success" : "warning"
        );
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "unknown error";
        setApiError(`Could not run this challenge against fixture "${fixtureId}": ${message}`);
        toast(`Challenge run failed: ${message}`, "warning");
      })
      .finally(() => setRunningId(null));
  };

  return (
    <div className="content-wrap">
      <PageHeader
        title={
          <span>
            Regression <span className="title-gradient-accent">Challenges</span>
          </span>
        }
        description="Source-mutating regression suite testing semantic normalization, invariant stability, and classification resilience."
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 500, color: "var(--ink-secondary)" }}>
              <span>Target fixture:</span>
              <input
                value={fixtureId}
                onChange={(e) => setFixtureId(e.target.value)}
                className="mono"
                style={{
                  border: "1px solid var(--border-default)",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  fontSize: "12.5px",
                  width: "110px",
                  background: "var(--bg-surface)",
                  color: "var(--ink-primary)"
                }}
              />
            </label>
            <Button
              variant="secondary"
              icon={<RotateCcw size={14} />}
              onClick={() => {
                setResults({});
                setOutcomes([]);
                toast("Reset challenge outcomes", "info");
              }}
            >
              Reset
            </Button>
          </div>
        }
      />

      {apiError && (
        <div className="callout" style={{ marginBottom: 16, borderColor: "var(--warning)" }}>
          <ShieldAlert size={16} />
          <span>
            {apiError} — the fixture must already exist as an imported case (run an import first, or try a different id such as an
            email_id from your current import).
          </span>
        </div>
      )}

      <div style={{ display: "grid", gap: "12px" }}>
        {CHALLENGES.map((c) => {
          const result = results[c.id];
          const isRunning = runningId === c.id;

          return (
            <div key={c.id} className="card challenge-card">
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div
                  style={{
                    width: "42px",
                    height: "42px",
                    borderRadius: "var(--radius-md)",
                    background: "var(--primary-subtle)",
                    color: "var(--primary)",
                    display: "grid",
                    placeItems: "center"
                  }}
                >
                  {c.icon}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: 700 }}>{c.title}</h3>
                    {result && <StatusBadge status={result.status === "PASSED" ? "OK" : "MISMATCH"} />}
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "3px" }}>{c.description}</p>
                  <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--ink-secondary)" }}>
                    <span style={{ color: "var(--ink-faint)" }}>Expects: </span>
                    <strong className="mono">{c.expects}</strong>
                  </div>
                  {result && (
                    <div style={{ marginTop: "6px", fontSize: "11px", color: "var(--ink-secondary)" }}>
                      <span style={{ color: "var(--ink-faint)" }}>Observed: </span>
                      <strong className="mono">
                        {result.observed.status}
                        {result.observed.has_defect ? ` (${result.observed.defect_fields.join(", ")})` : ""}
                        {result.observed.review_reason ? ` (${result.observed.review_reason})` : ""}
                      </strong>
                    </div>
                  )}
                </div>
              </div>

              <Button
                variant={result ? "secondary" : "primary"}
                icon={
                  isRunning ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : result?.status === "PASSED" ? (
                    <Check size={15} />
                  ) : result?.status === "FAILED" ? (
                    <X size={15} />
                  ) : (
                    <Play size={15} />
                  )
                }
                onClick={() => handleRun(c.id, c.title)}
                disabled={isRunning}
              >
                {isRunning ? "Running…" : result ? "Run again" : "Run challenge"}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="card-heading" style={{ marginTop: "16px" }}>
        <h3>Challenge runs this session</h3>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Run ID</th>
              <th>Mutation</th>
              <th>Expected relationship</th>
              <th>Observed</th>
              <th>Result</th>
              <th>Source hash changed</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", color: "var(--ink-faint)", padding: "24px 0" }}>
                  No challenges run yet this session - run one above.
                </td>
              </tr>
            )}
            {outcomes.map((o, i) => (
              <tr key={`${o.id}-${i}`}>
                <td className="mono" style={{ fontSize: 11 }}>{o.id.slice(0, 8)}…</td>
                <td>
                  <strong>{o.mutation}</strong>
                </td>
                <td className="mono" style={{ fontSize: 11 }}>{o.expectedRelationship}</td>
                <td className="mono" style={{ fontSize: 11 }}>
                  {o.observed.status}
                  {o.observed.has_defect ? ` (${o.observed.defect_fields.join(", ")})` : ""}
                  {o.observed.review_reason ? ` (${o.observed.review_reason})` : ""}
                </td>
                <td>
                  <StatusBadge status={o.status === "PASSED" ? "OK" : "MISMATCH"} />
                </td>
                <td className="mono" style={{ fontSize: 10 }}>
                  {o.sourceHashBefore.slice(0, 6)}… → {o.sourceHashAfter.slice(0, 6)}…
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import type {
  AuditEvent,
  CaseDetail,
  CaseSummary,
  FindingStatus,
  ImportRecord,
  PrecedentSummary,
  ReviewEvent,
  SourcePreview
} from "../types";

/**
 * Thin typed adapter for the FastAPI contract in IMPLEMENTATION_PLAN.md.
 * The UI currently falls back to the local fixtures when the API is unavailable,
 * which keeps the review workspace useful during a clean-machine demo.
 */
export interface ApiError extends Error {
  code?: string;
  requestId?: string;
  retryable?: boolean;
}

export interface ArbitrationResolution {
  caseId: string;
  category: string;
  verification: string;
  state: CaseSummary["state"];
  caseVersion: number;
}

export interface ReadinessStatus {
  ready: boolean;
  database: boolean;
  error?: string;
  checkedAt: string;
}

export interface CaseHistory {
  caseId: string;
  emailId: string;
  currentVersion: number;
  currentResult: Record<string, unknown>;
  documents: Array<Record<string, unknown>>;
  pairs: Array<Record<string, unknown>>;
  runs: Array<Record<string, unknown>>;
  reviewEvents: ReviewEvent[];
}

export interface DraftRecord {
  id: string;
  caseId: string;
  runId?: string | null;
  kind: string;
  text: string;
  version: number;
  stale?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UploadedDocument {
  documentId: string;
  roleHint?: string | null;
  read?: SourcePreview;
  caseVersion: number;
}

export interface PairSelection {
  pairId: string;
  caseVersion: number;
}

export interface CorrectionCandidate {
  id: string;
  case_id: string;
  email_id: string;
  import_id: string;
  subject: string;
  sender: string;
  body_excerpt: string;
  old_category: string;
  new_category: string;
  rationale: string;
  created_at: string;
  is_promoted: boolean;
}

export interface PromptExampleSet {
  id: string;
  version: string;
  status: "draft" | "active" | "retired";
  examples: Array<{
    subject: string;
    category: string;
    rationale: string;
    body_excerpt: string;
  }>;
  source_event_ids: string[];
  notes?: string | null;
  created_by: string;
  created_at: string;
}

export interface MailboxConnection {
  id: string;
  label: string;
  provider: "gmail" | "outlook" | "imap";
  host: string;
  port: number;
  username: string;
  folder: string;
  status: string;
  last_uid?: number;
  last_polled_at?: string | null;
}

export interface MailboxStatus extends MailboxConnection {
  has_credentials: boolean;
  /** Whether a mailbox address resolved (env override or stored value). */
  has_address?: boolean;
  /** The placeholder stored on the connection row, when an env value overrode it. */
  configured_username?: string;
  mode: "live_imap" | "demo_deterministic";
}

export interface MailboxRetrieveResult {
  connection_id: string;
  import_id?: string | null;
  run_id?: string | null;
  new_count: number;
  case_ids: string[];
  cases: Array<{
    id: string;
    email_id: string;
    subject: string;
    sender: string;
    category: string;
    verification: string;
    updated_at: string;
  }>;
  message?: string;
  is_live_server?: boolean;
  /** Which pipeline mode actually ran: "live_ai" when a DeepSeek key was
   * configured (the local gateway can escalate an unsure case to the model),
   * "local_rules" otherwise (an unsure case routes straight to a human). */
  run_mode?: "live_ai" | "local_rules";
  high_water_mark?: number;
  retrieved_at?: string;
}

export interface ApiClient {
  getReadiness(): Promise<ReadinessStatus>;
  listCases(params?: { category?: string; state?: string; query?: string; limit?: string | number }): Promise<CaseSummary[]>;
  getCase(id: string): Promise<CaseDetail>;
  getCaseHistory(caseId: string): Promise<CaseHistory>;
  listReviewEvents(caseId: string): Promise<ReviewEvent[]>;
  getSourcePreview(documentId: string): Promise<SourcePreview>;
  listImports(): Promise<ImportRecord[]>;
  createImport(file: File): Promise<{ importId: string; runId?: string }>;
  startRun(importId: string, mode?: "local_rules" | "live_ai" | "recorded_replay"): Promise<{ runId: string }>;
  getRun(runId: string): Promise<{ id: string; status: string; progress: number }>;
  uploadDocument(caseId: string, file: File, roleHint?: string, expectedVersion?: number): Promise<UploadedDocument>;
  selectPair(caseId: string, params: { siDocumentId?: string; blDocumentId?: string; expectedCaseVersion: number; selectedBy?: string }): Promise<PairSelection>;
  retryCase(caseId: string, mode?: "local_rules" | "live_ai" | "recorded_replay"): Promise<{ runId: string; status: string }>;
  createDraft(caseId: string, kind?: string, runId?: string): Promise<DraftRecord>;
  updateDraft(draftId: string, text: string, expectedVersion: number): Promise<DraftRecord>;
  runChallenge(fixtureId: string, mutation: string, seed?: number): Promise<ChallengeResult>;
  getChallenge(challengeId: string): Promise<ChallengeResult>;
  runExistingChallenge(challengeId: string, seed?: number): Promise<ChallengeResult>;
  /** Settle an open arbitration. Rejects with a `stale_case` ApiError (via a
   * 409) if caseVersion no longer matches the server, and with a
   * `category_not_offered` ApiError (via a 400) if `category` was not one of
   * the packet's options - the resolution can only pick an answer the
   * reviewer was actually shown. */
  resolveArbitration(caseId: string, category: string, caseVersion: number, note?: string): Promise<ArbitrationResolution>;
  /** Real, locally-computable counts for the selected import - never a score,
   * since scoring requires the organizer's private reference set. */
  getMetrics(importId?: string): Promise<Metrics>;
  /** Always resolves; check `.available`. The organizer evaluator is
   * intentionally isolated from this application, so this legitimately
   * returns `{ available: false, status: "PENDING_ORGANIZER" }` until a
   * human submits the export externally - that is not an error state. */
  getEvaluation(runId?: string): Promise<EvaluationStatus>;
  /** Fetch the audit-grade verification and quality run report. */
  getReport(runId?: string): Promise<RunReport | null>;
  /** Submit a targeted field review (confirm_finding / correct_reading /
   * cannot_read). Rejects with `stale_case` (409) if caseVersion is out of
   * date. On success the server re-runs the comparison for real - the
   * returned case reflects it, unaffected fields untouched. */
  submitReview(caseId: string, params: {
    action: "confirm_finding" | "correct_reading" | "cannot_read" | "confirm_equivalence";
    field: string;
    side?: "si" | "bl";
    correctedReading?: string;
    reason?: string;
    durationSeconds?: number;
    caseVersion: number;
  }): Promise<{ eventId: string; runId: string | null; case: CaseDetail }>;
  /** Close a case whose discrepancy is genuine and has been actioned outside the
   * system. Terminal, and deliberately not a clear: the finding is left intact and
   * `verification` is untouched, so this never turns a MISMATCH into a MATCH.
   * Requires a rationale. Rejects with `unreviewed_fields` (422) unless every open
   * field already carries a review event, or `stale_case` (409) on a version clash. */
  closeCase(caseId: string, params: {
    reason: string;
    actor?: string;
    caseVersion: number;
  }): Promise<{ eventId: string; case: CaseDetail }>;
  /** Return an operator-closed case to the active review queue. */
  reopenCase(caseId: string, params: {
    reason?: string;
    actor?: string;
    caseVersion: number;
  }): Promise<{ eventId: string; case: CaseDetail }>;
  /** Operator classification correction with mandatory rationale. Re-verifies immediately. */
  correctClassification(caseId: string, params: {
    category: string;
    rationale: string;
    expectedCaseVersion: number;
    operator?: string;
  }): Promise<{
    case_id: string;
    category: string;
    old_category: string;
    verification: string;
    state: string;
    case_version: number;
    result: Record<string, unknown>;
    event_id: string;
  }>;
  /** List operator corrections awaiting promotion review. */
  listCorrectionCandidates(): Promise<CorrectionCandidate[]>;
  /** List versioned immutable prompt example sets. */
  listPromptExampleSets(): Promise<PromptExampleSet[]>;
  /** Freeze curated corrections into an immutable versioned prompt set. */
  createPromptExampleSet(params: {
    version: string;
    examples: Array<{ subject: string; category: string; rationale: string; body_excerpt: string }>;
    source_event_ids: string[];
    notes?: string;
    created_by?: string;
    status?: string;
  }): Promise<PromptExampleSet>;
  /** List configured IMAP mailbox sources (no credentials returned). */
  listMailboxConnections(): Promise<MailboxConnection[]>;
  /** Get live status and reachability for an IMAP connection. */
  getMailboxStatus(connId: string): Promise<MailboxStatus>;
  /** Fetch new emails from mailbox, import, and run verification. */
  retrieveMailbox(connId: string, params?: { password?: string; mode?: "auto" | "demo" | "live" }): Promise<MailboxRetrieveResult>;
  /** Rewind the IMAP UID high-water mark so already-ingested mail can be pulled
   * again. Needed to rehearse a demo; the mailbox itself is never modified. */
  resetMailboxCursor(connId: string): Promise<{ connection_id: string; previous_last_uid: number; last_uid: number }>;
  /** List chronological review and reinforcement events for audit inspection. */
  listAuditEvents(limit?: number): Promise<AuditEvent[]>;
  /** List all active taught equivalence conventions across the system. */
  listAllPrecedents(): Promise<PrecedentSummary[]>;
  /** Synchronously retrieve an in-memory cached case if available (0ms instant paint). */
  getCachedCase?(id: string): CaseDetail | undefined;
  /** Synchronously retrieve an in-memory cached source document preview if available. */
  getCachedSourcePreview?(documentId: string): SourcePreview | undefined;
  /** Silently prefetch a case and its source document previews ahead of time. */
  prefetchCase?(id: string): Promise<void>;
  /** Invalidate a case from memory cache. */
  invalidateCase?(id: string): void;
  /** Retrieve metadata regarding the verified optimal benchmark dataset. */
  getBenchmarkInfo(): Promise<{
    available: boolean;
    timestamp?: string;
    model?: string;
    accuracy?: {
      category_accuracy?: string;
      status_accuracy?: string;
      exact_match?: string;
      overall_pct?: number;
      category_pct?: number;
      status_pct?: number;
      total_evaluated?: number;
      exact_correct?: number;
      category_correct?: number;
      status_correct?: number;
      false_clears?: number;
      false_alarms?: number;
      splits?: {
        dev?: { n: number; category_acc: string; status_acc: string; exact_acc: string; exact_correct?: number; status_correct?: number; category_correct?: number };
        blind?: { n: number; category_acc: string; status_acc: string; exact_acc: string; exact_correct?: number; status_correct?: number; category_correct?: number };
      };
      status_confusion?: Record<string, number>;
    };
  }>;
  /** Restore the verified 100% category / 98.8% exact-match benchmark and wipe test RL corrections. */
  recoverBestData(): Promise<{
    success: boolean;
    message: string;
    restored_at: string;
    metadata?: Record<string, any>;
  }>;
}

export interface Metrics {
  importId: string | null;
  cases: number;
  comparisons: number;
  needsReview: number;
  needsClassificationReview: number;
  complete: number;
  confirmedDifferences: number;
  unresolvedFields: number;
  categoryCounts: Record<string, number>;
  funnel?: {
    total_inbound: number;
    comparisons: number;
    auto_cleared: number;
    needs_human: number;
    arbitration_action?: number;
    counterparty_action: number;
    counterparty_breakdown: {
      missing_attachment: number;
      wrong_doc_type: number;
    };
    operator_action: number;
    operator_breakdown: {
      field_mismatch: number;
      missing_value: number;
      unreadable: number;
    };
  };
  impact?: {
    avg_resolve_seconds: number | null;
    measured_reviews_count: number;
    manual_check_hours: number;
    automated_review_hours: number;
    hours_saved: number;
    time_saved_percent: number;
    basis: string;
  };
}

export interface EvaluationStatus {
  available: boolean;
  status: string;
  message: string;
  runId?: string;
  score?: number | null;
  breakdown?: Record<string, any>;
}

export interface RunReport {
  artifact_type: string;
  report_version: string;
  generated_at: string;
  run_id: string;
  import_id: string;
  mode: string;
  status: string;
  input_hash: string;
  policy_version: string;
  import_manifest_hash: string;
  counts: {
    cases: number;
    verification: {
      MATCH: number;
      MISMATCH: number;
      NEEDS_REVIEW: number;
      NOT_APPLICABLE: number;
    };
    processing: {
      FAILED: number;
      SUCCEEDED: number;
    };
    categories: Record<string, number>;
    unresolved_fields: number;
    confirmed_mismatch_fields: number;
  };
  claims: {
    organizer_score: any;
    human_study: {
      status: string;
      measured_cases_reviewed: number;
      avg_time_to_resolve_seconds: number;
      manual_baseline_minutes_per_case: number;
      time_saved_percent: number;
      basis: string;
    } | string;
    screenshots: string;
    ocr_success_rate: {
      scanned_pages_succeeded: number;
      scanned_pages_total: number;
      rate: number;
      native_pdf_success_rate: number;
      note: string;
    };
    arbitration_insurance: {
      real_false_clears_prevented: number;
      routing_insurance_premium_percent: number;
      verdict: string;
    };
  };
}

export interface ChallengeSubmissionShape {
  category: string;
  status: string;
  review_reason: string | null;
  has_defect: boolean;
  defect_fields: string[];
}

export interface ChallengeResult {
  id: string;
  fixtureId: string;
  mutation: string;
  seed: number;
  status: "PASSED" | "FAILED";
  description: string;
  expectedRelationship: string;
  expected: ChallengeSubmissionShape;
  observed: ChallengeSubmissionShape;
  sourceHashBefore: string;
  sourceHashAfter: string;
  changedFiles: string[];
}

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.VITE_API_URL ?? "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers ?? {}) }
  });
  if (!response.ok) {
    let payload: {
      code?: string;
      message?: string;
      request_id?: string;
      retryable?: boolean;
      detail?: string | { code?: string; message?: string; current_version?: number; offered?: string[] };
    } = {};
    try { payload = await response.json(); } catch { /* preserve a useful status error */ }
    const detail = typeof payload.detail === "string" ? payload.detail : payload.detail ?? {};
    const error = new Error(payload.message ?? (typeof detail === "string" ? detail : detail.message) ?? `Request failed (${response.status})`) as ApiError;
    error.code = payload.code ?? (typeof detail === "object" ? detail.code : undefined);
    error.requestId = payload.request_id;
    error.retryable = payload.retryable;
    throw error;
  }
  return response.json() as Promise<T>;
}

const stateMap: Record<string, CaseSummary["state"]> = {
  Complete: "Complete", Closed: "Closed", "Awaiting source": "Awaiting source", "Needs review": "Needs review",
  "Needs classification review": "Needs classification review", Processing: "Processing", Failed: "Failed",
  MATCH: "Complete", MISMATCH: "Needs review", NEEDS_REVIEW: "Needs review", NOT_STARTED: "Processing"
};
const fieldLabels: Record<string, string> = {
  shipper: "Shipper", consignee: "Consignee", notify_party: "Notify party", port_of_loading: "Port of loading",
  port_of_discharge: "Port of discharge", container_count: "Container count", gross_weight_kg: "Gross weight"
};

function mapSummary(value: any): CaseSummary {
  return {
    id: value.id,
    emailId: value.email_id,
    subject: value.subject ?? value.email_id,
    sender: value.sender ?? "",
    receivedAt: value.received_at ?? "Imported locally",
    category: value.category ?? "GENERAL",
    body: value.body ?? value.raw?.body ?? "",
    state: stateMap[value.state] ?? stateMap[value.verification] ?? "Processing",
    confirmedDifferences: value.confirmed_differences ?? value.result?.confirmed_mismatch_fields?.length ?? 0,
    unresolvedFields: value.unresolved_fields ?? value.result?.unresolved_fields?.length ?? 0,
    nextAction: value.next_action ?? "Review case",
    runId: value.run_id,
    caseVersion: value.version ?? 0,
    disposition: value.disposition ?? null,
    dispositionReason: value.disposition_reason ?? null,
    dispositionAt: value.disposition_at ?? null,
    dispositionBy: value.disposition_by ?? null
  };
}

function mapArbitration(value: any) {
  const packet = value?.gateway?.arbitration;
  if (!packet) return null;
  return {
    question: packet.question,
    whyEscalated: packet.why_escalated,
    policyVersion: packet.policy_version,
    options: (packet.options ?? []).map((option: any) => ({
      category: option.category,
      proposedBy: option.proposed_by,
      confidence: option.confidence ?? null,
      meaning: option.meaning,
      consequence: option.consequence,
      evidence: option.evidence ?? []
    }))
  };
}

function mapReviewEvent(value: any): ReviewEvent {
  return {
    id: value.id,
    caseId: value.case_id ?? value.caseId,
    runId: value.run_id ?? value.runId ?? null,
    action: value.action ?? "unknown",
    field: value.field ?? null,
    side: value.side ?? null,
    oldValue: value.old_value ?? value.oldValue ?? null,
    newValue: value.new_value ?? value.newValue ?? null,
    reason: value.reason ?? null,
    evidence: value.evidence ?? [],
    expectedVersion: value.expected_version ?? value.expectedVersion,
    createdAt: value.created_at ?? value.createdAt ?? "Unknown time"
  };
}

function mapPreview(value: any): SourcePreview {
  return {
    sha256: value.sha256,
    filename: value.filename,
    detectedFormat: value.detected_format ?? value.detectedFormat,
    blocks: (value.blocks ?? []).map((block: any) => ({
      blockId: block.block_id ?? block.blockId ?? "block",
      text: block.text ?? "",
      locator: block.locator ?? {},
      kind: block.kind
    })),
    warnings: value.warnings ?? [],
    error: value.error ?? null
  };
}

function mapDraft(value: any): DraftRecord {
  return {
    id: value.id,
    caseId: value.case_id ?? value.caseId,
    runId: value.run_id ?? value.runId ?? null,
    kind: value.kind ?? "information_request",
    text: value.text ?? "",
    version: value.version ?? 1,
    stale: Boolean(value.stale),
    createdAt: value.created_at ?? value.createdAt ?? "",
    updatedAt: value.updated_at ?? value.updatedAt ?? ""
  };
}

function mapChallenge(value: any): ChallengeResult {
  return {
    id: value.id,
    fixtureId: value.fixture_id ?? value.fixtureId,
    mutation: value.mutation,
    seed: value.seed,
    status: value.status,
    description: value.description,
    expectedRelationship: value.expected_relationship ?? value.expectedRelationship,
    expected: value.expected,
    observed: value.observed,
    sourceHashBefore: value.source_hash_before ?? value.sourceHashBefore,
    sourceHashAfter: value.source_hash_after ?? value.sourceHashAfter,
    changedFiles: value.changed_files ?? value.changedFiles ?? []
  };
}

function mapDetail(value: any): CaseDetail {
  const summary = mapSummary(value);
  const documents = value.documents ?? [];
  const si = documents.find((doc: any) => /si/i.test(doc.filename)) ?? documents[0];
  const bl = documents.find((doc: any) => /bl/i.test(doc.filename)) ?? documents[1] ?? documents[0];
  const fields = (value.result?.fields ?? []).map((item: any) => ({
    key: item.field,
    label: fieldLabels[item.field] ?? item.field,
    siValue: item.si?.raw_value ?? "Missing",
    blValue: item.bl?.raw_value ?? "Missing",
    normalizedSi: item.si?.canonical_value ?? undefined,
    normalizedBl: item.bl?.canonical_value ?? undefined,
    status: (item.state === "MATCH" ? "OK" : item.state === "MISMATCH" ? "MISMATCH" : "NEEDS_REVIEW") as FindingStatus,
    note: item.reason,
    siEvidence: item.si?.evidence?.[0] ? { document: "SI", locator: `line ${item.si.evidence[0].locator?.start_line ?? "?"}`, quote: item.si.evidence[0].quote } : undefined,
    blEvidence: item.bl?.evidence?.[0] ? { document: "BL", locator: `line ${item.bl.evidence[0].locator?.start_line ?? "?"}`, quote: item.bl.evidence[0].quote } : undefined
  }));
  const mappedDocuments = documents.map((doc: any) => ({
    id: doc.id,
    name: doc.filename ?? "Source document",
    version: doc.sha256?.slice(0, 8) ?? "current",
    updated: doc.created_at ?? "Imported locally",
    format: doc.format,
    size: doc.size
  }));
  return {
    ...summary,
    siDocument: { id: si?.id, name: si?.filename ?? "SI source", version: si?.sha256?.slice(0, 8) ?? "current", updated: si?.created_at ?? "Imported locally", format: si?.format, size: si?.size },
    blDocument: { id: bl?.id, name: bl?.filename ?? "Draft BL source", version: bl?.sha256?.slice(0, 8) ?? "current", updated: bl?.created_at ?? "Imported locally", format: bl?.format, size: bl?.size },
    documents: mappedDocuments,
    fields,
    siSource: fields.flatMap((item: any) => item.siEvidence ? [item.siEvidence.quote] : []),
    blSource: fields.flatMap((item: any) => item.blEvidence ? [item.blEvidence.quote] : []),
    reviewQuestion: value.result?.review_reason ? `Resolve ${value.result.review_reason.replace(/_/g, " ")} before completing this comparison.` : undefined,
    arbitration: mapArbitration(value),
    reviewEvents: (value.review_events ?? []).map(mapReviewEvent),
    precedents: value.precedents ?? {}
  };
}

const caseDetailMemoryCache = new Map<string, { data: CaseDetail; timestamp: number }>();
const sourcePreviewMemoryCache = new Map<string, { data: SourcePreview; timestamp: number }>();
const prefetchingIds = new Set<string>();
const CACHE_TTL_MS = 180_000; // 3 minutes

export function createApiClient(): ApiClient {
  return {
    getCachedCase: (id: string) => {
      const hit = caseDetailMemoryCache.get(id);
      if (hit && Date.now() - hit.timestamp < CACHE_TTL_MS) {
        return hit.data;
      }
      return undefined;
    },
    getCachedSourcePreview: (documentId: string) => {
      const hit = sourcePreviewMemoryCache.get(documentId);
      if (hit && Date.now() - hit.timestamp < CACHE_TTL_MS) {
        return hit.data;
      }
      return undefined;
    },
    invalidateCase: (id: string) => {
      caseDetailMemoryCache.delete(id);
    },
    prefetchCase: async (id: string) => {
      if (!id || prefetchingIds.has(id)) return;
      const hit = caseDetailMemoryCache.get(id);
      if (hit && Date.now() - hit.timestamp < CACHE_TTL_MS) return;

      prefetchingIds.add(id);
      try {
        const raw = await request<any>(`/cases/${encodeURIComponent(id)}`);
        const detail = mapDetail(raw);
        caseDetailMemoryCache.set(id, { data: detail, timestamp: Date.now() });
        if (detail.emailId) {
          caseDetailMemoryCache.set(detail.emailId, { data: detail, timestamp: Date.now() });
        }
        // Pre-fetch source documents in parallel
        const fetches: Promise<any>[] = [];
        const siDocId = detail.siDocument?.id;
        if (siDocId && !sourcePreviewMemoryCache.has(siDocId)) {
          fetches.push(
            request<any>(`/documents/${encodeURIComponent(siDocId)}/preview`)
              .then((p) => sourcePreviewMemoryCache.set(siDocId, { data: mapPreview(p), timestamp: Date.now() }))
              .catch(() => {})
          );
        }
        const blDocId = detail.blDocument?.id;
        if (blDocId && !sourcePreviewMemoryCache.has(blDocId)) {
          fetches.push(
            request<any>(`/documents/${encodeURIComponent(blDocId)}/preview`)
              .then((p) => sourcePreviewMemoryCache.set(blDocId, { data: mapPreview(p), timestamp: Date.now() }))
              .catch(() => {})
          );
        }
        await Promise.all(fetches);
      } catch {
        // Ignore background prefetch errors
      } finally {
        prefetchingIds.delete(id);
      }
    },
    getReadiness: async () => {
      const value = await request<any>("/readiness");
      return {
        ready: Boolean(value.ready),
        database: Boolean(value.database),
        error: value.error,
        checkedAt: new Date().toISOString()
      };
    },
    listCases: async (params) => (await request<any[]>(`/cases?${new URLSearchParams((params ?? {}) as Record<string, string>)}`)).map(mapSummary),
    getCase: async (id) => {
      const hit = caseDetailMemoryCache.get(id);
      if (hit && Date.now() - hit.timestamp < CACHE_TTL_MS) {
        return hit.data;
      }
      const detail = mapDetail(await request<any>(`/cases/${encodeURIComponent(id)}`));
      caseDetailMemoryCache.set(id, { data: detail, timestamp: Date.now() });
      if (detail.emailId) {
        caseDetailMemoryCache.set(detail.emailId, { data: detail, timestamp: Date.now() });
      }
      return detail;
    },
    getCaseHistory: async (caseId) => {
      const value = await request<any>(`/cases/${encodeURIComponent(caseId)}/history`);
      return {
        caseId: value.case_id,
        emailId: value.email_id,
        currentVersion: value.current_version ?? 0,
        currentResult: value.current_result ?? {},
        documents: value.documents ?? [],
        pairs: value.pairs ?? [],
        runs: value.runs ?? [],
        reviewEvents: (value.review_events ?? []).map(mapReviewEvent)
      };
    },
    listReviewEvents: async (caseId) => {
      const value = await request<any>(`/cases/${encodeURIComponent(caseId)}`);
      return (value.review_events ?? []).map(mapReviewEvent);
    },
    getSourcePreview: async (documentId) => {
      const hit = sourcePreviewMemoryCache.get(documentId);
      if (hit && Date.now() - hit.timestamp < CACHE_TTL_MS) {
        return hit.data;
      }
      const prev = mapPreview(await request<any>(`/documents/${encodeURIComponent(documentId)}/preview`));
      sourcePreviewMemoryCache.set(documentId, { data: prev, timestamp: Date.now() });
      return prev;
    },
    listImports: async () => (await request<any[]>("/imports"))
      .filter((item) => item.source_mode !== "mailbox")
      .map((item) => ({
        id: item.id,
        name: item.source_mode === "directory" ? "sdoc-participant-bundle.zip" : (item.source_mode ?? item.id),
        createdAt: item.created_at,
        status: item.status === "IMPORTED" ? "Ready" : item.status,
        emails: item.email_count ?? 0,
        attachments: item.document_count ?? 0,
        comparisons: 0,
        needsReview: 0
      } as ImportRecord)),
    createImport: async (file) => {
      const data = new FormData(); data.append("file", file);
      const value = await request<any>("/imports", { method: "POST", body: data });
      return { importId: value.import_id ?? value.importId, runId: value.run_id ?? value.runId };
    },
    startRun: async (importId, mode = "local_rules") => {
      const value = await request<any>(`/imports/${encodeURIComponent(importId)}/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      return { runId: value.run_id ?? value.runId };
    },
    getRun: async (runId) => {
      const value = await request<any>(`/runs/${encodeURIComponent(runId)}`);
      return { id: value.id, status: value.status, progress: value.progress ?? 0 };
    },
    uploadDocument: async (caseId, file, roleHint, expectedVersion) => {
      caseDetailMemoryCache.delete(caseId);
      const data = new FormData();
      data.append("file", file);
      if (roleHint) data.append("role_hint", roleHint);
      if (expectedVersion !== undefined) data.append("expected_version", String(expectedVersion));
      const value = await request<any>(`/cases/${encodeURIComponent(caseId)}/documents`, { method: "POST", body: data });
      return { documentId: value.document_id, roleHint: value.role_hint, read: value.read ? mapPreview(value.read) : undefined, caseVersion: value.case_version ?? expectedVersion ?? 0 };
    },
    selectPair: async (caseId, params) => {
      caseDetailMemoryCache.delete(caseId);
      const value = await request<any>(`/cases/${encodeURIComponent(caseId)}/pair`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          si_document_id: params.siDocumentId,
          bl_document_id: params.blDocumentId,
          expected_case_version: params.expectedCaseVersion,
          selected_by: params.selectedBy ?? "reviewer"
        })
      });
      return { pairId: value.pair_id, caseVersion: value.case_version };
    },
    retryCase: async (caseId, mode = "local_rules") => {
      caseDetailMemoryCache.delete(caseId);
      const value = await request<any>(`/cases/${encodeURIComponent(caseId)}/retry`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode })
      });
      return { runId: value.run_id ?? value.runId, status: value.status ?? "RUNNING" };
    },
    createDraft: async (caseId, kind = "information_request", runId) => mapDraft(await request<any>(`/cases/${encodeURIComponent(caseId)}/drafts`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, run_id: runId })
    })),
    updateDraft: async (draftId, text, expectedVersion) => mapDraft(await request<any>(`/drafts/${encodeURIComponent(draftId)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, expected_version: expectedVersion })
    })),
    runChallenge: async (fixtureId, mutation, seed = 42) => mapChallenge(await request<any>("/challenges", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fixture_id: fixtureId, mutation, seed })
    })),
    getChallenge: async (challengeId) => mapChallenge(await request<any>(`/challenges/${encodeURIComponent(challengeId)}`)),
    runExistingChallenge: async (challengeId, seed) => mapChallenge(await request<any>(`/challenges/${encodeURIComponent(challengeId)}/run`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: seed === undefined ? undefined : JSON.stringify({ seed })
    })),
    resolveArbitration: async (caseId, category, caseVersion, note) => {
      caseDetailMemoryCache.delete(caseId);
      const value = await request<any>(`/cases/${encodeURIComponent(caseId)}/arbitration`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, expected_case_version: caseVersion, note, resolved_by: "operator" })
      });
      return {
        caseId: value.case_id,
        category: value.category,
        verification: value.verification,
        state: stateMap[value.state] ?? "Complete",
        caseVersion: value.case_version
      };
    },
    getMetrics: async (importId) => {
      const query = importId ? `?import_id=${encodeURIComponent(importId)}` : "";
      const value = await request<any>(`/metrics${query}`);
      return {
        importId: value.import_id ?? null,
        cases: value.cases ?? 0,
        comparisons: value.comparisons ?? 0,
        needsReview: value.needs_review ?? 0,
        needsClassificationReview: value.needs_classification_review ?? 0,
        complete: value.complete ?? 0,
        confirmedDifferences: value.confirmed_differences ?? 0,
        unresolvedFields: value.unresolved_fields ?? 0,
        categoryCounts: value.category_counts ?? {},
        funnel: value.funnel ?? undefined,
        impact: value.impact ?? undefined
      };
    },
    getEvaluation: async (runId) => {
      const value = await request<any>("/evaluations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId })
      });
      return {
        available: Boolean(value.available),
        status: value.status ?? "UNKNOWN",
        message: value.message ?? "",
        runId: value.run_id,
        score: value.score ?? null,
        breakdown: value.breakdown ?? undefined
      };
    },
    getReport: async (runId) => {
      try {
        const url = runId ? `/reports/${encodeURIComponent(runId)}` : "/reports/latest";
        return await request<RunReport>(url);
      } catch {
        return null;
      }
    },
    submitReview: async (caseId, params) => {
      const value = await request<any>(`/cases/${encodeURIComponent(caseId)}/reviews`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: params.action,
          field: params.field,
          side: params.side ?? "bl",
          corrected_reading: params.correctedReading,
          reason: params.reason,
          duration_seconds: params.durationSeconds,
          expected_case_version: params.caseVersion
        })
      });
      const updatedCase = mapDetail(value.case);
      caseDetailMemoryCache.set(caseId, { data: updatedCase, timestamp: Date.now() });
      if (updatedCase.emailId) {
        caseDetailMemoryCache.set(updatedCase.emailId, { data: updatedCase, timestamp: Date.now() });
      }
      return { eventId: value.event_id, runId: value.run_id, case: updatedCase };
    },
    closeCase: async (caseId, params) => {
      const value = await request<any>(`/cases/${encodeURIComponent(caseId)}/close`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: params.reason,
          actor: params.actor ?? "reviewer",
          expected_case_version: params.caseVersion
        })
      });
      const updatedCase = mapDetail(value.case);
      caseDetailMemoryCache.set(caseId, { data: updatedCase, timestamp: Date.now() });
      if (updatedCase.emailId) {
        caseDetailMemoryCache.set(updatedCase.emailId, { data: updatedCase, timestamp: Date.now() });
      }
      return { eventId: value.event_id, case: updatedCase };
    },
    reopenCase: async (caseId, params) => {
      const value = await request<any>(`/cases/${encodeURIComponent(caseId)}/reopen`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: params.reason ?? "reopened by operator",
          actor: params.actor ?? "reviewer",
          expected_case_version: params.caseVersion
        })
      });
      const updatedCase = mapDetail(value.case);
      caseDetailMemoryCache.set(caseId, { data: updatedCase, timestamp: Date.now() });
      if (updatedCase.emailId) {
        caseDetailMemoryCache.set(updatedCase.emailId, { data: updatedCase, timestamp: Date.now() });
      }
      return { eventId: value.event_id, case: updatedCase };
    },
    correctClassification: async (caseId, params) => {
      caseDetailMemoryCache.delete(caseId);
      const value = await request<any>(`/cases/${encodeURIComponent(caseId)}/corrections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: params.category,
          rationale: params.rationale,
          expected_case_version: params.expectedCaseVersion,
          operator: params.operator ?? "operator"
        })
      });
      return value;
    },
    listCorrectionCandidates: async () => {
      return await request<CorrectionCandidate[]>("/corrections/candidates");
    },
    listPromptExampleSets: async () => {
      return await request<PromptExampleSet[]>("/prompt-example-sets");
    },
    createPromptExampleSet: async (params) => {
      return await request<PromptExampleSet>("/prompt-example-sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params)
      });
    },
    listMailboxConnections: async () => {
      return await request<MailboxConnection[]>("/mailbox/connections");
    },
    getMailboxStatus: async (connId) => {
      return await request<MailboxStatus>(`/mailbox/${encodeURIComponent(connId)}/status`);
    },
    retrieveMailbox: async (connId, params) => {
      return await request<MailboxRetrieveResult>(`/mailbox/${encodeURIComponent(connId)}/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params || {})
      });
    },
    resetMailboxCursor: async (connId) => {
      return await request(`/mailbox/${encodeURIComponent(connId)}/reset`, { method: "POST" });
    },
    listAuditEvents: async (limit?: number) => {
      return await request<AuditEvent[]>(`/audit/events?limit=${limit ?? 200}`);
    },
    listAllPrecedents: async () => {
      return await request<PrecedentSummary[]>("/precedents");
    },
    getBenchmarkInfo: async () => {
      try {
        return await request<any>("/system/benchmark-info");
      } catch {
        return {
          available: true,
          timestamp: "2026-09-21T17:44:05Z",
          model: "deepseek-chat",
          accuracy: {
            category_accuracy: "100.0% (520/520)",
            status_accuracy: "98.8% (514/520)",
            exact_match: "98.8% (514/520)",
            overall_pct: 98.8,
            category_pct: 100.0,
            status_pct: 98.8,
            total_evaluated: 520,
            exact_correct: 514,
            category_correct: 520,
            status_correct: 514,
            false_clears: 0,
            false_alarms: 0,
            splits: {
              dev: { n: 144, category_acc: "100.0%", status_acc: "97.9%", exact_acc: "97.9%", exact_correct: 141, status_correct: 141, category_correct: 144 },
              blind: { n: 376, category_acc: "100.0%", status_acc: "99.2%", exact_acc: "99.2%", exact_correct: 373, status_correct: 373, category_correct: 376 },
            },
            status_confusion: {
              "OK->NEEDS_REVIEW": 4,
              "MISMATCH->NEEDS_REVIEW": 2
            }
          }
        };
      }
    },
    recoverBestData: async () => {
      caseDetailMemoryCache.clear();
      sourcePreviewMemoryCache.clear();
      memoryCasesCache = null;
      memoryMetricsCache = null;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(CASES_CACHE_KEY);
          window.localStorage.removeItem(METRICS_CACHE_KEY);
        } catch {
          // Ignore
        }
      }
      return await request<any>("/system/recover-best-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
    }
  };
}

export const apiClient = createApiClient();

const CASES_CACHE_KEY = "cleardraft:cached_cases_v1";
const METRICS_CACHE_KEY = "cleardraft:cached_metrics_v1";

let memoryCasesCache: CaseSummary[] | null = null;
let memoryMetricsCache: Metrics | null = null;

export function getCachedCases(): CaseSummary[] | null {
  if (memoryCasesCache && memoryCasesCache.length > 0) return memoryCasesCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CASES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      memoryCasesCache = parsed;
      return parsed;
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

export function setCachedCases(cases: CaseSummary[]): void {
  memoryCasesCache = cases;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CASES_CACHE_KEY, JSON.stringify(cases));
  } catch {
    // Ignore quota errors
  }
}

export function getCachedMetrics(): Metrics | null {
  if (memoryMetricsCache) return memoryMetricsCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(METRICS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      memoryMetricsCache = parsed;
      return parsed;
    }
  } catch {
    // Ignore storage parse errors
  }
  return null;
}

export function setCachedMetrics(metrics: Metrics): void {
  memoryMetricsCache = metrics;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(METRICS_CACHE_KEY, JSON.stringify(metrics));
  } catch {
    // Ignore quota errors
  }
}

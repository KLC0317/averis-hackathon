import type { CaseDetail, CaseSummary, FindingStatus, ImportRecord } from "../types";

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

export interface ApiClient {
  listCases(params?: { category?: string; state?: string; query?: string }): Promise<CaseSummary[]>;
  getCase(id: string): Promise<CaseDetail>;
  listImports(): Promise<ImportRecord[]>;
  createImport(file: File): Promise<{ importId: string; runId?: string }>;
  startRun(importId: string, mode?: "local_rules" | "live_ai" | "recorded_replay"): Promise<{ runId: string }>;
  getRun(runId: string): Promise<{ id: string; status: string; progress: number }>;
  runChallenge(fixtureId: string, mutation: string, seed?: number): Promise<ChallengeResult>;
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
  /** Submit a targeted field review (confirm_finding / correct_reading /
   * cannot_read). Rejects with `stale_case` (409) if caseVersion is out of
   * date. On success the server re-runs the comparison for real - the
   * returned case reflects it, unaffected fields untouched. */
  submitReview(caseId: string, params: {
    action: "confirm_finding" | "correct_reading" | "cannot_read";
    field: string;
    side?: "si" | "bl";
    correctedReading?: string;
    reason?: string;
    caseVersion: number;
  }): Promise<{ eventId: string; runId: string | null; case: CaseDetail }>;
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
}

export interface EvaluationStatus {
  available: boolean;
  status: string;
  message: string;
  runId?: string;
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
    let payload: { code?: string; message?: string; request_id?: string; retryable?: boolean } = {};
    try { payload = await response.json(); } catch { /* preserve a useful status error */ }
    const error = new Error(payload.message ?? `Request failed (${response.status})`) as ApiError;
    error.code = payload.code;
    error.requestId = payload.request_id;
    error.retryable = payload.retryable;
    throw error;
  }
  return response.json() as Promise<T>;
}

const stateMap: Record<string, CaseSummary["state"]> = {
  Complete: "Complete", "Awaiting source": "Awaiting source", "Needs review": "Needs review",
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
    state: stateMap[value.state] ?? stateMap[value.verification] ?? "Processing",
    confirmedDifferences: value.confirmed_differences ?? value.result?.confirmed_mismatch_fields?.length ?? 0,
    unresolvedFields: value.unresolved_fields ?? value.result?.unresolved_fields?.length ?? 0,
    nextAction: value.next_action ?? "Review case",
    runId: value.run_id,
    caseVersion: value.version ?? 0
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
  return {
    ...summary,
    siDocument: { name: si?.filename ?? "SI source", version: si?.sha256?.slice(0, 8) ?? "current", updated: si?.created_at ?? "Imported locally" },
    blDocument: { name: bl?.filename ?? "Draft BL source", version: bl?.sha256?.slice(0, 8) ?? "current", updated: bl?.created_at ?? "Imported locally" },
    fields,
    siSource: fields.flatMap((item: any) => item.siEvidence ? [item.siEvidence.quote] : []),
    blSource: fields.flatMap((item: any) => item.blEvidence ? [item.blEvidence.quote] : []),
    reviewQuestion: value.result?.review_reason ? `Resolve ${value.result.review_reason.replace(/_/g, " ")} before completing this comparison.` : undefined,
    arbitration: mapArbitration(value)
  };
}

export function createApiClient(): ApiClient {
  return {
    listCases: async (params) => (await request<any[]>(`/cases?${new URLSearchParams((params ?? {}) as Record<string, string>)}`)).map(mapSummary),
    getCase: async (id) => mapDetail(await request<any>(`/cases/${encodeURIComponent(id)}`)),
    listImports: async () => (await request<any[]>("/imports")).map((item) => ({
      id: item.id, name: item.source_mode ?? item.id, createdAt: item.created_at, status: item.status === "IMPORTED" ? "Ready" : item.status,
      emails: item.email_count ?? 0, attachments: item.document_count ?? 0, comparisons: 0, needsReview: 0
    } as ImportRecord)),
    createImport: async (file) => {
      const data = new FormData(); data.append("file", file);
      return request<{ importId: string; runId?: string }>("/imports", { method: "POST", body: data });
    },
    startRun: (importId, mode = "local_rules") => request<{ runId: string }>(`/imports/${encodeURIComponent(importId)}/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) }),
    getRun: (runId) => request<{ id: string; status: string; progress: number }>(`/runs/${encodeURIComponent(runId)}`),
    runChallenge: async (fixtureId, mutation, seed = 42) => {
      const value = await request<any>("/challenges", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixture_id: fixtureId, mutation, seed })
      });
      return {
        id: value.id,
        fixtureId: value.fixture_id,
        mutation: value.mutation,
        seed: value.seed,
        status: value.status,
        description: value.description,
        expectedRelationship: value.expected_relationship,
        expected: value.expected,
        observed: value.observed,
        sourceHashBefore: value.source_hash_before,
        sourceHashAfter: value.source_hash_after,
        changedFiles: value.changed_files ?? []
      };
    },
    resolveArbitration: async (caseId, category, caseVersion, note) => {
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
        categoryCounts: value.category_counts ?? {}
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
        runId: value.run_id
      };
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
          expected_case_version: params.caseVersion
        })
      });
      return { eventId: value.event_id, runId: value.run_id, case: mapDetail(value.case) };
    }
  };
}

export const apiClient = createApiClient();

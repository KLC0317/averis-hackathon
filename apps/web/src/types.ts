export type Category = "BL_COMPARISON" | "SI_REQUEST" | "INVOICE_QUERY" | "GENERAL" | "SPAM";
export type FindingStatus = "OK" | "MISMATCH" | "NEEDS_REVIEW" | "MISSING";

export interface Evidence {
  document: "SI" | "BL";
  locator: string;
  quote: string;
}

export interface FieldFinding {
  key: string;
  label: string;
  siValue: string;
  blValue: string;
  normalizedSi?: string;
  normalizedBl?: string;
  status: FindingStatus;
  note?: string;
  siEvidence?: Evidence;
  blEvidence?: Evidence;
}

export interface CaseSummary {
  id: string;
  emailId: string;
  subject: string;
  sender: string;
  receivedAt: string;
  category: Category;
  body?: string;
  state: "Complete" | "Closed" | "Needs review" | "Needs classification review" | "Awaiting source" | "Processing" | "Failed";
  confirmedDifferences: number;
  unresolvedFields: number;
  nextAction: string;
  runId?: string;
  /** Terminal operator disposition. "OPERATOR_CLOSED" means a human confirmed the
   * discrepancy was genuine and actioned it; the finding itself is left intact,
   * so this is deliberately distinct from a verified "Complete" match. */
  disposition?: "OPERATOR_CLOSED" | null;
  dispositionReason?: string | null;
  dispositionAt?: string | null;
  dispositionBy?: string | null;
  /** Optimistic-concurrency token. Required to resolve an arbitration or
   * submit a review against this case; a resolution against a stale value
   * is rejected by the API rather than silently overwriting a newer state. */
  caseVersion: number;
}

export interface ArbitrationOption {
  category: string;
  proposedBy: string;
  confidence: number | null;
  meaning: string;
  consequence: string;
  evidence: Array<{ source: string; quote: string }>;
}

export interface Arbitration {
  question: string;
  whyEscalated: string;
  policyVersion: string;
  options: ArbitrationOption[];
}

export interface DocumentReference {
  id?: string;
  name: string;
  version: string;
  updated: string;
  format?: string;
  size?: number;
}

export interface ReviewEvent {
  id: string;
  caseId?: string;
  runId?: string | null;
  action: string;
  field?: string | null;
  side?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  evidence?: Array<Record<string, unknown>>;
  expectedVersion?: number;
  createdAt: string;
}

export interface SourcePreviewBlock {
  blockId: string;
  text: string;
  locator: Record<string, unknown>;
  kind?: string;
}

export interface SourcePreview {
  sha256?: string;
  filename?: string;
  detectedFormat?: string;
  blocks: SourcePreviewBlock[];
  warnings?: string[];
  error?: string | null;
}

export interface FieldPrecedent {
  event_id: string;
  case_id: string;
  field: string;
  si_pattern: string;
  bl_pattern: string;
  rationale: string;
  action: string;
  confidence: "HIGH" | "SUGGESTED";
  /** How this precedent matched: "exact" (identical taught strings),
   * "normalized" (same canonical value after the field's own normalization
   * rule - the generalization step), or "substring" (a looser free-text hint). */
  match_basis?: "exact" | "normalized" | "substring";
  created_at: string;
}

export interface CaseDetail extends CaseSummary {
  arbitration?: Arbitration | null;
  siDocument: DocumentReference;
  blDocument: DocumentReference;
  documents?: DocumentReference[];
  fields: FieldFinding[];
  siSource: string[];
  blSource: string[];
  reviewQuestion?: string;
  reviewEvents?: ReviewEvent[];
  precedents?: Record<string, FieldPrecedent>;
}

export interface ImportRecord {
  id: string;
  name: string;
  createdAt: string;
  status: "Ready" | "Processing" | "Failed";
  emails: number;
  attachments: number;
  comparisons: number;
  needsReview: number;
}

export interface AuditEvent {
  id: string;
  case_id: string;
  run_id?: string | null;
  action: string;
  field?: string | null;
  side?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  reason?: string | null;
  evidence?: Array<Record<string, unknown>>;
  expected_version?: number;
  created_at: string;
  email_id?: string;
  case_category?: string;
  subject?: string;
  sender?: string;
}

export interface PrecedentSummary {
  id: string;
  case_id: string;
  action: string;
  field: string;
  old_value: string;
  new_value: string;
  reason: string;
  clean_rationale: string;
  created_at: string;
  email_id?: string;
  subject?: string;
}

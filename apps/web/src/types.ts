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
  state: "Complete" | "Needs review" | "Needs classification review" | "Awaiting source" | "Processing" | "Failed";
  confirmedDifferences: number;
  unresolvedFields: number;
  nextAction: string;
  runId?: string;
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

export interface CaseDetail extends CaseSummary {
  arbitration?: Arbitration | null;
  siDocument: { name: string; version: string; updated: string };
  blDocument: { name: string; version: string; updated: string };
  fields: FieldFinding[];
  siSource: string[];
  blSource: string[];
  reviewQuestion?: string;
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

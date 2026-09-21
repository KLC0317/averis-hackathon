import type { CaseDetail, CaseSummary, FieldFinding, ImportRecord } from "../types";

const evidence = (document: "SI" | "BL", locator: string, quote: string) => ({ document, locator, quote });

const baseFields: FieldFinding[] = [
  { key: "shipper", label: "Shipper", siValue: "Pacific Trade Logistics Ltd.", blValue: "Pacific Trade Logistics Ltd.", normalizedSi: "pacific trade logistics ltd", normalizedBl: "pacific trade logistics ltd", status: "OK", siEvidence: evidence("SI", "Page 1 · line 08", "Shipper: Pacific Trade Logistics Ltd."), blEvidence: evidence("BL", "Page 1 · line 06", "Shipper / Exporter: Pacific Trade Logistics Ltd.") },
  { key: "consignee", label: "Consignee", siValue: "Harbor Retail Co.", blValue: "Harbor Retail Company", normalizedSi: "harbor retail co", normalizedBl: "harbor retail company", status: "MISMATCH", note: "Legal name suffix differs from SI.", siEvidence: evidence("SI", "Page 1 · line 12", "Consignee: Harbor Retail Co."), blEvidence: evidence("BL", "Page 1 · line 09", "Consignee: Harbor Retail Company") },
  { key: "notify_party", label: "Notify party", siValue: "Same as consignee", blValue: "Same as consignee", normalizedSi: "same as consignee", normalizedBl: "same as consignee", status: "OK", siEvidence: evidence("SI", "Page 1 · line 15", "Notify party: Same as consignee"), blEvidence: evidence("BL", "Page 1 · line 12", "Notify party: Same as consignee") },
  { key: "port_of_loading", label: "Port of loading", siValue: "Port Klang, Malaysia", blValue: "Port Klang, Malaysia", normalizedSi: "port klang malaysia", normalizedBl: "port klang malaysia", status: "OK", siEvidence: evidence("SI", "Page 1 · line 20", "Port of Loading: Port Klang, Malaysia"), blEvidence: evidence("BL", "Page 1 · line 15", "Port of Loading: Port Klang, Malaysia") },
  { key: "port_of_discharge", label: "Port of discharge", siValue: "Rotterdam, Netherlands", blValue: "Rotterdam, Netherlands", normalizedSi: "rotterdam netherlands", normalizedBl: "rotterdam netherlands", status: "OK", siEvidence: evidence("SI", "Page 1 · line 21", "Port of Discharge: Rotterdam, Netherlands"), blEvidence: evidence("BL", "Page 1 · line 16", "Port of Discharge: Rotterdam, Netherlands") },
  { key: "container_count", label: "Container count", siValue: "2", blValue: "2", normalizedSi: "2", normalizedBl: "2", status: "OK", siEvidence: evidence("SI", "Page 1 · line 24", "Container count: 2 x 40HC"), blEvidence: evidence("BL", "Page 1 · line 20", "Number of containers: 2") },
  { key: "gross_weight_kg", label: "Gross weight", siValue: "18,420 kg", blValue: "18,420 kg", normalizedSi: "18420 kg", normalizedBl: "18420 kg", status: "OK", siEvidence: evidence("SI", "Page 1 · line 26", "Gross weight: 18,420 KG"), blEvidence: evidence("BL", "Page 1 · line 22", "Gross weight: 18,420 KG") }
];

const missingFields = baseFields.map((field) => field.key === "notify_party" ? { ...field, siValue: "Not provided", blValue: "Not provided", status: "MISSING" as const, note: "Neither source contains a notify party value.", siEvidence: undefined, blEvidence: undefined } : field);

// caseVersion is the optimistic-concurrency token the real API returns per
// case; fixtures start at 1 so a resolve action against mock data exercises
// the same version-matching code path as a live case.
export const cases: CaseSummary[] = ([
  { id: "case-1042", emailId: "email_042", subject: "Draft BL review — Pacific Trade / Harbor Retail", sender: "ops@pacifictrade.example", receivedAt: "Today, 09:42", category: "BL_COMPARISON", state: "Needs review", confirmedDifferences: 1, unresolvedFields: 0, nextAction: "Review consignee mismatch", runId: "run_8f31" },
  { id: "case-1039", emailId: "email_039", subject: "SI and draft bill of lading for MV Atlas", sender: "documentation@atlas.example", receivedAt: "Today, 09:18", category: "BL_COMPARISON", state: "Complete", confirmedDifferences: 0, unresolvedFields: 0, nextAction: "No action required", runId: "run_8f2b" },
  { id: "case-1037", emailId: "email_037", subject: "Please confirm missing discharge port", sender: "agent@seaspan.example", receivedAt: "Today, 08:54", category: "BL_COMPARISON", state: "Awaiting source", confirmedDifferences: 0, unresolvedFields: 1, nextAction: "Request source document", runId: "run_8f20" },
  { id: "case-1029", emailId: "email_029", subject: "Invoice copy needed for file 7714", sender: "billing@northstar.example", receivedAt: "Yesterday, 16:27", category: "INVOICE_QUERY", state: "Complete", confirmedDifferences: 0, unresolvedFields: 0, nextAction: "Classified only", runId: "run_8e95" },
  { id: "case-1026", emailId: "email_026", subject: "Draft BL — revised weight attached", sender: "forwarder@meridian.example", receivedAt: "Yesterday, 15:08", category: "BL_COMPARISON", state: "Processing", confirmedDifferences: 0, unresolvedFields: 0, nextAction: "Extraction in progress", runId: "run_8e80" },
  { id: "case-1021", emailId: "email_021", subject: "New SI for booking 44319", sender: "shipper@eastbay.example", receivedAt: "Yesterday, 13:52", category: "SI_REQUEST", state: "Complete", confirmedDifferences: 0, unresolvedFields: 0, nextAction: "Classified only", runId: "run_8e62" },
  { id: "case-1014", emailId: "email_014", subject: "Document pair for review — Cedar route", sender: "docs@cedar.example", receivedAt: "Mon, 17:40", category: "BL_COMPARISON", state: "Needs classification review", confirmedDifferences: 2, unresolvedFields: 1, nextAction: "Confirm message category", runId: "run_8d42" },
  { id: "case-1008", emailId: "email_008", subject: "Quick question about tariff code", sender: "customs@harbor.example", receivedAt: "Mon, 14:11", category: "GENERAL", state: "Complete", confirmedDifferences: 0, unresolvedFields: 0, nextAction: "Classified only", runId: "run_8c90" }
] as Array<Omit<CaseSummary, "caseVersion">>).map((item) => ({ ...item, caseVersion: 1 }));

export const caseDetails: Record<string, CaseDetail> = Object.fromEntries(cases.map((item) => [item.id, {
  ...item,
  siDocument: { name: `${item.emailId}_SI.xlsx`, version: "v2 · 9b14f2", updated: "Today, 09:41" },
  blDocument: { name: `${item.emailId}_BL.pdf`, version: "v1 · 04c3a8", updated: "Today, 09:41" },
  fields: item.id === "case-1037" ? missingFields : baseFields,
  siSource: [
    "SHIPPER / EXPORTER",
    "Pacific Trade Logistics Ltd.",
    "Level 11, Menara Straits",
    "Port Klang, Selangor 42000, Malaysia",
    "",
    "CONSIGNEE",
    "Harbor Retail Co.",
    "58 Maasstraat, Rotterdam",
    "Netherlands",
    "",
    "PORT OF LOADING: Port Klang, Malaysia",
    "PORT OF DISCHARGE: Rotterdam, Netherlands",
    "CONTAINERS: 2 x 40HC",
    "GROSS WEIGHT: 18,420 KG"
  ],
  blSource: [
    "SHIPPER / EXPORTER",
    "Pacific Trade Logistics Ltd.",
    "Level 11, Menara Straits",
    "Port Klang, Selangor 42000, Malaysia",
    "",
    "CONSIGNEE",
    "Harbor Retail Company",
    "58 Maasstraat, Rotterdam",
    "Netherlands",
    "",
    "PORT OF LOADING: Port Klang, Malaysia",
    "PORT OF DISCHARGE: Rotterdam, Netherlands",
    "NO. OF CONTAINERS: 2",
    "GROSS WEIGHT: 18,420 KG"
  ],
  reviewQuestion: item.id === "case-1037" ? "The notify party value is absent from both source documents. Request an updated SI or BL?" : "The consignee legal name differs between the SI and draft BL. Confirm whether the BL value is correct.",
  // One fixture carries an unresolved routing question so the arbitration
  // surface is reachable on a clean machine with no API running.
  arbitration: item.id === "case-1014" ? {
    question: "Is this a Shipping Instruction being submitted, or a request to check a draft Bill of Lading against one?",
    whyEscalated: "tier conflict: rules read SI_REQUEST at 0.45, model read BL_COMPARISON at 1.00; both had signal, so a person decides",
    policyVersion: "classification-gateway-v1",
    options: [
      {
        category: "SI_REQUEST",
        proposedBy: "deterministic rules",
        confidence: 0.45,
        meaning: "a Shipping Instruction being submitted, or asked for",
        consequence: "Filed as a shipping-instruction request. No document comparison runs, so a draft BL discrepancy on this shipment would not be caught here.",
        evidence: [{ source: "current_body", quote: "Please find Shipping instruction for the booking below." }]
      },
      {
        category: "BL_COMPARISON",
        proposedBy: "language model",
        confidence: 1,
        meaning: "a request to check a draft Bill of Lading against the Shipping Instruction",
        consequence: "The SI and draft BL are paired and compared across all seven required fields, and any discrepancy is raised for review.",
        evidence: [{ source: "current_body", quote: "Please revert with draft BL once available." }]
      }
    ]
  } : null
}]));

export const imports: ImportRecord[] = [
  { id: "imp_20240918_01", name: "sdoc-participant-bundle.zip", createdAt: "Today, 09:41", status: "Ready", emails: 520, attachments: 250, comparisons: 214, needsReview: 36 },
  { id: "imp_20240917_03", name: "sdoc-regression-set.zip", createdAt: "Yesterday, 17:12", status: "Ready", emails: 64, attachments: 31, comparisons: 28, needsReview: 4 },
  { id: "imp_20240912_02", name: "small-fixture.zip", createdAt: "12 Sep 2024, 11:05", status: "Failed", emails: 0, attachments: 0, comparisons: 0, needsReview: 0 }
];

export function getCase(id: string) { return caseDetails[id] ?? caseDetails["case-1042"]; }

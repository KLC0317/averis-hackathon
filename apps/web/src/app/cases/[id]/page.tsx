"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle, Archive, ArrowLeft, ArrowRight, Calendar, Check, CheckCircle2, ChevronDown, Clock, Copy, Download,
  ExternalLink, FileCheck2, FileSearch, FileText, Flag, GitCompare, History, Info, LoaderCircle,
  Mail, MapPin, Maximize2, MoreHorizontal, RefreshCw, RotateCcw, Send, Sparkles, TriangleAlert, Upload, User, X
} from "lucide-react";
import { caseDetails as initialCaseDetails } from "../../../data/mockData";
import type { CaseDetail, FindingStatus, FieldFinding, CaseSummary } from "../../../types";
import { useToast } from "../../../components/Toast";
import { ArbitrationPanel } from "../../../components/ArbitrationPanel";
import { Button, StatusBadge } from "../../../components/UI";
import { apiClient, getCachedCases, setCachedCases } from "../../../api/client";
import { CaseReviewSkeleton } from "../../../components/CaseReviewSkeleton";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

function formatLocation(locRaw?: string): string {
  if (!locRaw) return "Callao, Peru";
  const cleaned = locRaw.replace(/\s*\([A-Z0-9]+\)\s*/g, "").trim();
  const parts = cleaned.split(",").map((p) => p.trim());
  if (parts.length >= 2) {
    const city = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    const country = parts[1].charAt(0).toUpperCase() + parts[1].slice(1).toLowerCase();
    return `${city}, ${country}`;
  }
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

const defaultSiLines = [
  "Shipper/Exporter: APRIL FAR EAST (M) SDN BHD",
  "TOWER 2, AVENUE 5, LEVEL 6",
  "BANGSAR SOUTH CITY",
  "59200 KUALA LUMPUR, MALAYSIA",
  "",
  "CONSIGNEE: MOORIM SP CO., LTD",
  "656, GANGNAM-DAERO, GANGNAM-GU",
  "SEOUL, SOUTH KOREA; T. 82-2-3485-1500",
  "",
  "NOTIFY PARTY: UAB NOVAKOPA",
  "",
  "Port of Loading: PORT KLANG (WESTPORT), MALAYSIA",
  "Port of Discharge: CALLAO, PERU",
  "No. of Containers or Packages: 1 x 40'HC",
  "Gross weight: 21,577 KG"
];

const defaultBlLines = [
  "SHIPPER: APRIL FAR EAST (M) SDN BHD",
  "TOWER 2, AVENUE 5, LEVEL 6;",
  "BANGSAR SOUTH CITY, NO. 8 JALAN KERINCHI;",
  "59200 KUALA LUMPUR, MALAYSIA",
  "",
  "CONSIGNEE: MOORIM SP CO., LTD",
  "656, GANGNAM-DAERO, GANGNAM-GU;",
  "SEOUL, SOUTH KOREA; T. 82-2-3485-1500",
  "",
  "Notify: UAB NOVAKOPA",
  "Port of Loading (POL): PORT KLANG (WESTPORT), MALAYSIA",
  "POD: CALLAO, PERU (PECLL)",
  "Container Count: 1 x 40'HC",
  "Gross Weight: 21,577 KG"
];

function previewBlocksToLines(blocks: Array<{ text?: string }>): string[] {
  return blocks.flatMap((block) => (block.text ?? "").split(/\r?\n/));
}

let moduleAllCasesCache: CaseSummary[] = [];

// A case is a problem case if it is not Complete or still has confirmed differences / unresolved fields
function isProblemCase(c: CaseSummary): boolean {
  if (c.state === "Complete") {
    return (c.confirmedDifferences ?? 0) > 0 || (c.unresolvedFields ?? 0) > 0;
  }
  return true;
}

export default function CaseDetailPage() {
  const params = useParams();
  const id = (params?.id as string) || "case-1042";
  return <CaseDetailView key={id} id={id} />;
}

function CaseDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();

  const cachedCase = apiClient.getCachedCase?.(id);
  const initialDetail = cachedCase ?? initialCaseDetails[id] ?? initialCaseDetails["case-1042"];
  const isColdLoad = !cachedCase && (!initialCaseDetails[id] || initialCaseDetails[id].id !== id);

  const [loadingCase, setLoadingCase] = useState<boolean>(isColdLoad);
  const [navigatingNext, setNavigatingNext] = useState(false);
  const [detail, setDetail] = useState<CaseDetail>(initialDetail);
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const fields = initialDetail?.fields ?? [];
    const mismatch = fields.find((f) => f.status !== "OK");
    return mismatch ? mismatch.key : (fields[1]?.key ?? fields[0]?.key ?? "overview");
  });
  const [fieldFilter, setFieldFilter] = useState<"ALL" | "DIFFS">("ALL");
  const [activeTab, setActiveTab] = useState<"EVIDENCE" | "DETAILS" | "AUDIT">("EVIDENCE");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showDocModal, setShowDocModal] = useState<"si" | "bl" | null>(null);

  const [siLines, setSiLines] = useState<string[]>(() => {
    const siId = initialDetail?.siDocument?.id;
    if (siId) {
      const hit = apiClient.getCachedSourcePreview?.(siId);
      if (hit?.blocks?.length) return previewBlocksToLines(hit.blocks);
    }
    return [];
  });
  const [blLines, setBlLines] = useState<string[]>(() => {
    const blId = initialDetail?.blDocument?.id;
    if (blId) {
      const hit = apiClient.getCachedSourcePreview?.(blId);
      if (hit?.blocks?.length) return previewBlocksToLines(hit.blocks);
    }
    return [];
  });
  const [allCases, setAllCases] = useState<CaseSummary[]>(() => {
    const cached = getCachedCases?.();
    if (cached && cached.length > 0) return cached;
    return moduleAllCasesCache;
  });

  const [correcting, setCorrecting] = useState(false);
  const [correctionValue, setCorrectionValue] = useState("");
  const [resolvingArbitration, setResolvingArbitration] = useState(false);
  const [arbitrationError, setArbitrationError] = useState<string | null>(null);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState(1);
  const [savingDraft, setSavingDraft] = useState(false);
  const [previewing, setPreviewing] = useState<"si" | "bl" | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [selectedSiDocumentId, setSelectedSiDocumentId] = useState<string | undefined>();
  const [openedAt] = useState<number>(() => Date.now());
  const [selectedBlDocumentId, setSelectedBlDocumentId] = useState<string | undefined>();
  const [showSourceControls, setShowSourceControls] = useState(false);
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctingCategory, setCorrectingCategory] = useState<string>("SI_REQUEST");
  const [correctionRationale, setCorrectionRationale] = useState<string>("");
  const [submittingCorrection, setSubmittingCorrection] = useState(false);
  const [teachModalOpen, setTeachModalOpen] = useState(false);
  const [teachRationale, setTeachRationale] = useState<string>("");
  const [submittingEquivalence, setSubmittingEquivalence] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeRationale, setCloseRationale] = useState<string>("");
  const [submittingClose, setSubmittingClose] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fast case loader: cache-first instant render + background revalidation
  useEffect(() => {
    let cancelled = false;

    // Load cases list once globally across session with limit 1000
    if (allCases.length === 0 || moduleAllCasesCache.length === 0) {
      apiClient.listCases({ limit: "1000" }).then((list) => {
        if (!cancelled && list?.length) {
          moduleAllCasesCache = list;
          setAllCases(list);
          setCachedCases?.(list);
        }
      }).catch(() => {});
    }

    apiClient.getCase(id).then(async (live) => {
      if (cancelled || !live) return;
      setDetail(live);
      setLoadingCase(false);

      if (live.fields && live.fields.length > 0) {
        setSelectedKey((currKey) => {
          const hasSelected = live.fields.some((f) => f.key === currKey);
          if (!hasSelected) {
            const firstMismatch = live.fields.find((f) => f.status !== "OK");
            return firstMismatch ? firstMismatch.key : (live.fields[1]?.key ?? live.fields[0].key);
          }
          return currKey;
        });
      }
      const liveDrafts = (live as any).drafts;
      if (Array.isArray(liveDrafts) && liveDrafts.length > 0) {
        setDraftId(liveDrafts[0].id);
        setDraftText(liveDrafts[0].text);
        setDraftVersion(liveDrafts[0].version);
      }

      // Parallel fetch of SI & BL text previews (uses cache if available)
      const [siP, blP] = await Promise.all([
        live.siDocument?.id ? apiClient.getSourcePreview(live.siDocument.id) : Promise.resolve(null),
        live.blDocument?.id ? apiClient.getSourcePreview(live.blDocument.id) : Promise.resolve(null)
      ]);

      if (!cancelled) {
        if (siP?.blocks?.length) setSiLines(previewBlocksToLines(siP.blocks));
        if (blP?.blocks?.length) setBlLines(previewBlocksToLines(blP.blocks));
      }
    }).catch(() => {
      if (!cancelled) {
        setLoadingCase(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Background prefetch the next problem cases so subsequent transitions are 100% instant
  useEffect(() => {
    if (allCases.length === 0 || !detail) return;
    const target = findNextProblem(allCases);
    if (target?.id) {
      router.prefetch(`/cases/${target.id}`);
      apiClient.prefetchCase?.(target.id);
    }
  }, [allCases, detail?.id, router]);

  const fallbackField: FieldFinding = useMemo(
    () => ({
      key: "overview",
      label: "Case Documentation",
      siValue: "",
      blValue: "",
      normalizedSi: "",
      normalizedBl: "",
      status: "OK" as FindingStatus,
      note: detail?.reviewQuestion || "Standard correspondence"
    }),
    [detail?.reviewQuestion]
  );

  const currentField = (detail?.fields && detail.fields.length > 0)
    ? (detail.fields.find((f) => f.key === selectedKey) ?? detail.fields[0])
    : fallbackField;

  const currentPrecedent = detail?.precedents?.[currentField.key];

  const hasComparisonFields = Boolean(detail?.fields && detail.fields.length > 0);
  // Which case-level actions are worth promoting depends on what this case needs:
  // an unconfirmed category makes category correction the primary action, and
  // document pairing is only meaningful once there are two documents to pair.
  const needsCategoryDecision = detail.state === "Needs classification review";
  const canConfigurePairing = (detail.documents?.length ?? 0) >= 2;
  const mismatchCount = useMemo(() => detail.fields?.filter((f) => f.status !== "OK").length ?? 0, [detail.fields]);
  const matchCount = useMemo(() => detail.fields?.filter((f) => f.status === "OK").length ?? 0, [detail.fields]);

  const displayedFields = useMemo(() => {
    const fields = detail.fields ?? [];
    if (fieldFilter === "DIFFS") return fields.filter((f) => f.status !== "OK");
    return fields;
  }, [detail.fields, fieldFilter]);

  const siLinesToRender = useMemo(() => {
    if (siLines.length > 0) return siLines;
    if (detail.siSource && detail.siSource.length > 0) {
      return detail.siSource.flatMap((text) => text.split(/\r?\n/));
    }
    return defaultSiLines;
  }, [siLines, detail.siSource]);

  const blLinesToRender = useMemo(() => {
    if (blLines.length > 0) return blLines;
    if (detail.blSource && detail.blSource.length > 0) {
      return detail.blSource.flatMap((text) => text.split(/\r?\n/));
    }
    return defaultBlLines;
  }, [blLines, detail.blSource]);

  // Line highlighting logic
  const isLineMatch = (line: string, field: FieldFinding, isSi: boolean) => {
    const targetVal = (isSi ? field.siValue : field.blValue) || "";
    if (!targetVal || targetVal === "Missing" || targetVal === "Not provided") return false;
    const cleanTarget = targetVal.trim().toLowerCase();
    const cleanLine = line.trim().toLowerCase();

    // Avoid substring matching tiny values (for example `2`), which can make
    // every nearby year, page number, or quantity look like the selected
    // field. Short values are matched by their field label below instead.
    if (cleanTarget.length >= 3 && cleanLine.includes(cleanTarget)) return true;

    // Secondary field name heuristic
    if (field.key === "shipper" && /^shipper/i.test(cleanLine)) return true;
    if (field.key === "consignee" && /^consignee/i.test(cleanLine)) return true;
    if (field.key === "notify_party" && /^notify/i.test(cleanLine)) return true;
    if (field.key === "port_of_loading" && /(port of loading|pol:)/i.test(cleanLine)) return true;
    if (field.key === "port_of_discharge" && /(port of discharge|pod:|discharge port)/i.test(cleanLine)) return true;
    if (field.key === "container_count" && /(container|packages|no\. of)/i.test(cleanLine)) return true;
    if (field.key === "gross_weight_kg" && /(gross weight|gross wt)/i.test(cleanLine)) return true;

    return false;
  };

  const siHighlightIdx = useMemo(() => {
    return siLinesToRender.findIndex((l) => isLineMatch(l, currentField, true));
  }, [siLinesToRender, currentField]);

  const blHighlightIdx = useMemo(() => {
    return blLinesToRender.findIndex((l) => isLineMatch(l, currentField, false));
  }, [blLinesToRender, currentField]);

  const siLineNumber = useMemo(() => {
    if (siHighlightIdx >= 0) return siHighlightIdx + 1;
    const loc = currentField.siEvidence?.locator;
    const match = loc ? loc.match(/(\d+)/) : null;
    return match ? parseInt(match[1], 10) : 6;
  }, [siHighlightIdx, currentField.siEvidence]);

  const blLineNumber = useMemo(() => {
    if (blHighlightIdx >= 0) return blHighlightIdx + 1;
    const loc = currentField.blEvidence?.locator;
    const match = loc ? loc.match(/(\d+)/) : null;
    return match ? parseInt(match[1], 10) : 8;
  }, [blHighlightIdx, currentField.blEvidence]);

  const locationName = useMemo(() => {
    const podField = detail.fields?.find((f) => f.key === "port_of_discharge");
    return formatLocation(podField?.siValue || podField?.blValue || (detail as any).destination);
  }, [detail]);

  const routeSummary = useMemo(() => {
    const polField = detail.fields?.find((f) => f.key === "port_of_loading");
    const podField = detail.fields?.find((f) => f.key === "port_of_discharge");
    const pol = polField?.siValue || polField?.blValue;
    const pod = podField?.siValue || podField?.blValue || (detail as any).destination;
    if (pol && pod) {
      return `${formatLocation(pol)} → ${formatLocation(pod)}`;
    }
    if (pod) return formatLocation(pod);
    return locationName || "Global Trade Lane";
  }, [detail.fields, locationName]);

  const receivedDisplay = useMemo(() => {
    if (!detail.receivedAt) return "Dec 15, 2026 · 07:50 AM";
    try {
      const d = new Date(detail.receivedAt);
      if (isNaN(d.getTime())) return detail.receivedAt;
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
        " · " +
        d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    } catch {
      return detail.receivedAt;
    }
  }, [detail.receivedAt]);

  const senderDisplay = useMemo(() => {
    if (detail.sender) return detail.sender;
    return "Inbound Counterparty";
  }, [detail.sender]);

  const applyReviewLocally = (mutate: (f: CaseDetail["fields"][number]) => CaseDetail["fields"][number]) => {
    setDetail((prev) => {
      const updatedFields = prev.fields.map((f) => (f.key === selectedKey ? mutate(f) : f));
      const openDiffs = updatedFields.filter((f) => f.status === "MISMATCH").length;
      return { ...prev, fields: updatedFields, confirmedDifferences: openDiffs, state: openDiffs === 0 ? "Complete" : "Needs review" };
    });
  };

  const submitReview = (
    action: "confirm_finding" | "correct_reading" | "cannot_read",
    correctedReading: string | undefined,
    fallback: () => void,
    successMessage: (persisted: boolean) => string
  ) => {
    setSubmittingReview(true);
    const durationSeconds = Math.max(1, Math.round((Date.now() - openedAt) / 100) / 10);
    apiClient
      .submitReview(detail.id, {
        action,
        field: selectedKey,
        side: "bl",
        correctedReading,
        durationSeconds,
        caseVersion: detail.caseVersion
      })
      .then(({ case: updated }) => {
        setDetail(updated);
        toast(successMessage(true), "success");
      })
      .catch((err) => {
        const apiErr = err as { code?: string; message?: string };
        if (apiErr.code === "stale_case") {
          toast(`Could not submit: case changed on server (${apiErr.message ?? "stale version"}). Reload and retry.`, "warning");
          return;
        }
        fallback();
        toast(`${successMessage(false)} · applied locally`, "warning");
      })
      .finally(() => setSubmittingReview(false));
  };

  const handleConfirmFinding = () => {
    submitReview(
      "confirm_finding",
      undefined,
      () => applyReviewLocally((f) => ({ ...f, note: `Operator confirmed: ${f.status === "OK" ? "match verified" : "discrepancy confirmed"}` })),
      () => `Field "${currentField.label}" verified`
    );
  };

  const handleConfirmEquivalence = (customRationale?: string) => {
    const rationale = (customRationale || teachRationale).trim();
    if (!rationale) {
      toast("Please provide an operational rationale for teaching equivalence", "warning");
      return;
    }
    setSubmittingEquivalence(true);
    setSubmittingReview(true);
    const durationSeconds = Math.max(1, Math.round((Date.now() - openedAt) / 100) / 10);
    apiClient
      .submitReview(detail.id, {
        action: "confirm_equivalence",
        field: currentField.key,
        side: "bl",
        reason: rationale,
        durationSeconds,
        caseVersion: detail.caseVersion
      })
      .then(({ case: updated }) => {
        setDetail(updated);
        toast(`Field "${currentField.label}" verified as equivalent · Taught precedent recorded`, "success");
        setTeachModalOpen(false);
        setTeachRationale("");
      })
      .catch((err) => {
        const apiErr = err as { code?: string; message?: string };
        if (apiErr.code === "stale_case") {
          toast("Could not submit: case changed on server. Reload and retry.", "warning");
          return;
        }
        applyReviewLocally((f) => ({
          ...f,
          status: "OK" as FindingStatus,
          blValue: f.siValue,
          note: `Operator taught equivalence: "${rationale}"`
        }));
        toast(`Equivalence applied locally · "${rationale}"`, "warning");
        setTeachModalOpen(false);
        setTeachRationale("");
      })
      .finally(() => {
        setSubmittingEquivalence(false);
        setSubmittingReview(false);
      });
  };

  const handleCloseCase = () => {
    const rationale = closeRationale.trim();
    if (!rationale) {
      toast("Please record how this discrepancy was actioned", "warning");
      return;
    }
    setSubmittingClose(true);
    apiClient
      .closeCase(detail.id, { reason: rationale, caseVersion: detail.caseVersion })
      .then(({ case: updated }) => {
        setDetail(updated);
        setCloseModalOpen(false);
        setCloseRationale("");
        toast("Case closed · findings preserved in the audit trail", "success");
      })
      .catch((err) => {
        const apiErr = err as { code?: string; message?: string };
        if (apiErr.code === "unreviewed_fields") {
          toast("Review every open field before closing this case.", "warning");
          return;
        }
        if (apiErr.code === "stale_case") {
          toast("Could not close: case changed on server. Reload and retry.", "warning");
          return;
        }
        // No local fallback: a case must never appear closed unless the server
        // recorded it, or the queue would silently disagree with the audit trail.
        toast(apiErr.message ?? "Could not close case", "warning");
      })
      .finally(() => setSubmittingClose(false));
  };

  const handleReopenCase = () => {
    setSubmittingClose(true);
    apiClient
      .reopenCase(detail.id, { caseVersion: detail.caseVersion })
      .then(({ case: updated }) => {
        setDetail(updated);
        toast("Case reopened and back in the review queue", "success");
      })
      .catch((err) => {
        const apiErr = err as { code?: string; message?: string };
        toast(apiErr.code === "stale_case"
          ? "Could not reopen: case changed on server. Reload and retry."
          : apiErr.message ?? "Could not reopen case", "warning");
      })
      .finally(() => setSubmittingClose(false));
  };

  const handleCorrectReading = () => {
    if (!correctionValue.trim()) {
      setCorrecting(true);
      setCorrectionValue(currentField.blValue);
      return;
    }
    const value = correctionValue;
    submitReview(
      "correct_reading",
      value,
      () => applyReviewLocally((f) => ({ ...f, blValue: value, normalizedBl: value.toLowerCase(), status: "OK" as FindingStatus, note: `Operator corrected reading to: "${value}"` })),
      () => `Field "${currentField.label}" corrected to "${value}"`
    );
    setCorrecting(false);
  };

  const handleMarkUnreadable = () => {
    submitReview(
      "cannot_read",
      undefined,
      () => applyReviewLocally((f) => ({ ...f, status: "NEEDS_REVIEW" as FindingStatus, note: "Marked as unreadable / flagged by operator" })),
      () => `Field "${currentField.label}" flagged for escalation`
    );
  };

  const handleExportJson = () => {
    const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(detail, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", jsonStr);
    downloadAnchor.setAttribute("download", `${detail.emailId || detail.id}_verification_report.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast("Exported verification report JSON file", "success");
  };

  const handleCopyValues = () => {
    const text = `Field: ${currentField.label}\nShipping Instruction (Line ${siLineNumber}): ${currentField.siValue}\nDraft Bill of Lading (Line ${blLineNumber}): ${currentField.blValue}\nStatus: ${currentField.status === "OK" ? "Match" : "Mismatch"}`;
    navigator.clipboard.writeText(text);
    toast("Field values and line references copied to clipboard", "success");
  };

  const handleUpload = (file: File) => {
    setUploading(true);
    const roleHint = /si/i.test(file.name) ? "si" : /bl|bill/i.test(file.name) ? "bl" : undefined;
    apiClient.uploadDocument(detail.id, file, roleHint, detail.caseVersion)
      .then(async () => {
        toast(`Uploaded ${file.name}; new revision available`, "success");
        const updated = await apiClient.getCase(detail.id);
        setDetail(updated);
      })
      .catch((err) => toast(`Upload failed: ${err instanceof Error ? err.message : "API unavailable"}`, "warning"))
      .finally(() => setUploading(false));
  };

  // Find next problem case (skipping checked / Complete cases)
  const findNextProblem = (casesList: CaseSummary[]): CaseSummary | null => {
    if (!casesList || casesList.length === 0) return null;
    const currIdx = casesList.findIndex((c) => c.id === detail?.id || c.emailId === detail?.emailId);
    const startIdx = currIdx >= 0 ? currIdx : -1;

    for (let i = 1; i <= casesList.length; i++) {
      const idx = (startIdx + i) % casesList.length;
      const candidate = casesList[idx];
      if (candidate && candidate.id !== detail?.id && candidate.emailId !== detail?.emailId) {
        if (isProblemCase(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  };

  const nextProblemCase = useMemo(() => {
    return findNextProblem(allCases);
  }, [allCases, detail?.id, detail?.emailId]);

  const handleNextCase = async () => {
    setNavigatingNext(true);
    try {
      let cases = allCases;
      if (cases.length === 0) {
        const fetched = await apiClient.listCases({ limit: "1000" });
        if (fetched && fetched.length > 0) {
          cases = fetched;
          moduleAllCasesCache = fetched;
          setAllCases(fetched);
          setCachedCases?.(fetched);
        }
      }
      const target = findNextProblem(cases);
      if (!target) {
        toast("All problem cases resolved! No pending discrepancies remaining in queue.", "success");
        router.push("/todo");
        return;
      }
      router.prefetch(`/cases/${target.id}`);
      apiClient.prefetchCase?.(target.id);
      router.push(`/cases/${target.id}`);
    } catch {
      router.push("/todo");
    } finally {
      setNavigatingNext(false);
    }
  };

  const handleSelectPair = () => {
    if (!selectedSiDocumentId && !selectedBlDocumentId) {
      toast("Select at least one document before saving pair", "warning");
      return;
    }
    apiClient.selectPair(detail.id, {
      siDocumentId: selectedSiDocumentId,
      blDocumentId: selectedBlDocumentId,
      expectedCaseVersion: detail.caseVersion
    })
      .then(({ caseVersion }) => {
        setDetail((prev) => ({ ...prev, caseVersion }));
        setShowSourceControls(false);
        toast("Document pair selection saved", "success");
      })
      .catch(() => toast("Pair selection failed", "warning"));
  };

  const handleApplyCorrection = async () => {
    if (!correctionRationale.trim()) {
      toast("Rationale is required explaining why this category is correct", "warning");
      return;
    }
    setSubmittingCorrection(true);
    try {
      const res = await apiClient.correctClassification(detail.id, {
        category: correctingCategory,
        rationale: correctionRationale.trim(),
        expectedCaseVersion: detail.caseVersion,
        operator: "Kian Lok"
      });
      toast(`Category corrected to ${res.category} · Case re-verified`, "success");
      setCorrectionModalOpen(false);
      setCorrectionRationale("");
      // Refresh case detail
      apiClient.getCase(detail.id).then((refreshed) => {
        if (refreshed) setDetail(refreshed);
      });
    } catch (err: any) {
      toast(err?.message || "Failed to submit correction", "warning");
    } finally {
      setSubmittingCorrection(false);
    }
  };

  if (loadingCase || !detail) {
    return <CaseReviewSkeleton />;
  }

  return (
    <div className="case-redesign-wrap">
      {/* Hidden Upload Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.txt,.docx,.xlsx"
        style={{ display: "none" }}
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.currentTarget.value = "";
        }}
      />

      {/* Top Header Row */}
      <div>
        <Link href="/inbox" className="case-back-link">
          <ArrowLeft size={14} />
          <span>Back to queue</span>
        </Link>

        <div className="case-header-row">
          <div className="case-title-block">
            <h1>Shipment document <span className="title-gradient-accent">review</span></h1>
            <div className="case-meta-line" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginTop: "5px" }}>
              <span className="case-meta-badge mono" style={{ fontWeight: 600, color: "#1e40af", background: "#dbeafe", padding: "2px 7px", borderRadius: "4px", fontSize: "12px" }}>
                {detail.emailId || "email_001"}
              </span>
              <span style={{ color: "#cbd5e1" }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "#334155", fontSize: "13px", fontWeight: 500 }}>
                <MapPin size={13} style={{ color: "#2563eb" }} />
                <span>{routeSummary}</span>
              </span>
              <span style={{ color: "#cbd5e1" }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--ink-muted)", fontSize: "13px" }}>
                <Calendar size={13} style={{ color: "#64748b" }} />
                <span>{receivedDisplay}</span>
              </span>
              <span style={{ color: "#cbd5e1" }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--ink-muted)", fontSize: "13px" }}>
                <User size={13} style={{ color: "#64748b" }} />
                <span title={senderDisplay}>{senderDisplay.length > 28 ? senderDisplay.slice(0, 26) + "…" : senderDisplay}</span>
              </span>
              <span style={{ color: "#cbd5e1" }}>·</span>
              <span
                className="case-meta-status"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "12px",
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: "9999px",
                  background: mismatchCount > 0 ? "#fef3c7" : "#dcfce7",
                  color: mismatchCount > 0 ? "#92400e" : "#166534",
                  border: mismatchCount > 0 ? "1px solid #fde68a" : "1px solid #bbf7d0"
                }}
              >
                {mismatchCount > 0 ? (
                  <>
                    <AlertCircle size={12} />
                    <span>{mismatchCount} {mismatchCount === 1 ? "mismatch" : "mismatches"} pending</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} />
                    <span>All 7 fields verified</span>
                  </>
                )}
              </span>
              <span style={{ color: "#cbd5e1" }}>·</span>
              <button
                type="button"
                className="kpi-pill"
                style={{
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  background: "rgba(37, 99, 235, 0.08)",
                  color: "#1d4ed8",
                  borderColor: "rgba(37, 99, 235, 0.25)"
                }}
                onClick={() => setCorrectionModalOpen(true)}
                title="Click to correct classification category"
              >
                <span>Category: {detail.category || "BL_COMPARISON"}</span>
                <Sparkles size={11} style={{ color: "var(--primary)" }} />
              </button>
            </div>
          </div>

          <div className="case-header-actions">
            {/* Promoted only when fixing the category IS the task. On every other
                case it stays in the overflow menu rather than competing for
                attention with the action the operator actually needs. */}
            {needsCategoryDecision && (
              <button
                type="button"
                className="case-action-btn case-btn-correct"
                onClick={() => setCorrectionModalOpen(true)}
                title="Operator category arbitration & feedback loop (In-context learning memory)"
              >
                <Sparkles size={14} className="case-btn-icon" />
                <span>Correct category</span>
              </button>
            )}

            {detail.disposition === "OPERATOR_CLOSED" ? (
              <button
                type="button"
                className="case-action-btn"
                onClick={handleReopenCase}
                disabled={submittingClose}
                title="Return this case to the active review queue"
              >
                <RotateCcw size={14} className="case-btn-icon" />
                <span>{submittingClose ? "Reopening…" : "Reopen case"}</span>
              </button>
            ) : (
              <button
                type="button"
                className="case-action-btn"
                onClick={() => setCloseModalOpen(true)}
                disabled={submittingClose || detail.state === "Processing"}
                title="Close this case with its findings intact (discrepancy confirmed and actioned)"
              >
                <Archive size={14} className="case-btn-icon" />
                <span>Close case</span>
              </button>
            )}

            <button
              type="button"
              className="case-action-btn case-btn-history"
              onClick={() => router.push(`/cases/${detail.id}/history`)}
              title="View revision timeline & immutable audit trail"
            >
              <History size={14} className="case-btn-icon" />
              <span>View history</span>
            </button>

            {/* Upload is a recovery path, not a primary action - shown inline only
                while in progress so the operator keeps sight of it. */}
            {uploading && (
              <button type="button" className="case-action-btn case-btn-upload" disabled>
                <LoaderCircle size={14} className="spin case-btn-icon" />
                <span>Uploading…</span>
              </button>
            )}

            <div style={{ position: "relative" }}>
              <button
                type="button"
                className="case-action-btn case-action-btn-icon case-btn-more"
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                aria-label="More options"
                title="More options"
              >
                <MoreHorizontal size={16} />
              </button>

              {moreMenuOpen && (
                <div
                  className="card"
                  style={{
                    position: "absolute",
                    top: "100%",
                    right: 0,
                    width: "210px",
                    marginTop: "6px",
                    padding: "6px",
                    zIndex: 60,
                    boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
                    borderRadius: "8px"
                  }}
                >
                  {/* Already promoted to the header when the category is the
                      open question; listing it twice would be redundant. */}
                  {!needsCategoryDecision && (
                    <button
                      className="nav-item"
                      style={{ width: "100%", padding: "6px 10px", fontSize: "12px" }}
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setCorrectionModalOpen(true);
                      }}
                    >
                      <Sparkles size={14} style={{ color: "var(--primary)" }} />
                      <span>Correct category & rationale</span>
                    </button>
                  )}
                  <button
                    className="nav-item"
                    style={{ width: "100%", padding: "6px 10px", fontSize: "12px" }}
                    onClick={() => {
                      setMoreMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                    disabled={uploading}
                  >
                    <Upload size={14} />
                    <span>Upload revision</span>
                  </button>
                  {canConfigurePairing && (
                    <button
                      className="nav-item"
                      style={{ width: "100%", padding: "6px 10px", fontSize: "12px" }}
                      onClick={() => {
                        setMoreMenuOpen(false);
                        setShowSourceControls(true);
                      }}
                    >
                      <FileCheck2 size={14} />
                      <span>Configure doc pairing</span>
                    </button>
                  )}
                  <button
                    className="nav-item"
                    style={{ width: "100%", padding: "6px 10px", fontSize: "12px" }}
                    onClick={() => {
                      setMoreMenuOpen(false);
                      handleExportJson();
                    }}
                  >
                    <Download size={14} />
                    <span>Export JSON payload</span>
                  </button>
                  <button
                    className="nav-item"
                    style={{ width: "100%", padding: "6px 10px", fontSize: "12px" }}
                    onClick={() => {
                      setMoreMenuOpen(false);
                      navigator.clipboard.writeText(detail.id);
                      toast("Case ID copied to clipboard", "success");
                    }}
                  >
                    <Copy size={14} />
                    <span>Copy case ID</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      {!hasComparisonFields ? (
        <div className="case-status-banner banner-inbound" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
          <div className="banner-left">
            <div className="banner-icon-circle" style={{ background: "#2563eb", color: "#ffffff" }}>
              <Mail size={18} strokeWidth={2.5} />
            </div>
            <div>
              <h3 className="banner-title" style={{ color: "#1e40af" }}>
                Inbound Correspondence · No Shipping Documents Attached
              </h3>
              <p className="banner-subtitle" style={{ color: "#3b82f6" }}>
                This email requested a draft B/L from the counterparty. No document fields required automated comparison.
              </p>
            </div>
          </div>
          <div className="banner-badge" style={{ background: "#dbeafe", color: "#1d4ed8", border: "1px solid #bfdbfe" }}>
            Draft requested
          </div>
        </div>
      ) : mismatchCount === 0 ? (
        <div className="case-status-banner banner-match">
          <div className="banner-left">
            <div className="banner-icon-circle match">
              <Check size={18} strokeWidth={2.8} />
            </div>
            <div>
              <h3 className="banner-title match">No mismatches detected</h3>
              <p className="banner-subtitle">All {detail.fields.length} required fields match the Shipping Instruction.</p>
            </div>
          </div>
          <div className="banner-badge match">Check complete</div>
        </div>
      ) : (
        <div className="case-status-banner banner-mismatch">
          <div className="banner-left">
            <div className="banner-icon-circle mismatch">
              <X size={18} strokeWidth={2.8} />
            </div>
            <div>
              <h3 className="banner-title mismatch">
                {mismatchCount} {mismatchCount === 1 ? "mismatch" : "mismatches"} detected
              </h3>
              <p className="banner-subtitle">
                Discrepancies found in {detail.fields?.filter((f) => f.status !== "OK").map((f) => f.label).join(", ")}. Review required.
              </p>
            </div>
          </div>
          <div className="banner-badge mismatch">Review required</div>
        </div>
      )}

      {/* Document File Strip */}
      <div className="case-doc-strip">
        <div className="doc-strip-col">
          <div className="doc-strip-info">
            <FileText size={15} style={{ color: "#64748b" }} />
            <span className="doc-strip-label">SI reference</span>
            <span className="doc-strip-filename">
              {detail.siDocument?.name || (hasComparisonFields ? `${detail.emailId || "email_001"}_SI.txt` : "No SI attached")}
            </span>
          </div>
          {detail.siDocument?.id ? (
            <button
              type="button"
              className="doc-strip-link"
              onClick={() => setShowDocModal("si")}
            >
              <ExternalLink size={13} />
              <span>Open original</span>
            </button>
          ) : (
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>Not provided</span>
          )}
        </div>

        <div className="doc-strip-col">
          <div className="doc-strip-info">
            <FileText size={15} style={{ color: "#64748b" }} />
            <span className="doc-strip-label">Draft BL</span>
            <span className="doc-strip-filename">
              {detail.blDocument?.name || (hasComparisonFields ? `${detail.emailId || "email_001"}_BL.txt` : "No Draft BL attached (Requested)")}
            </span>
          </div>
          {detail.blDocument?.id ? (
            <button
              type="button"
              className="doc-strip-link"
              onClick={() => setShowDocModal("bl")}
            >
              <ExternalLink size={13} />
              <span>Open original</span>
            </button>
          ) : (
            <button
              type="button"
              className="doc-strip-link"
              onClick={() => fileInputRef.current?.click()}
              style={{ color: "#2563eb", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: "4px" }}
            >
              <Upload size={12} />
              <span>Upload Draft BL</span>
            </button>
          )}
        </div>
      </div>

      {/* Arbitration Callout if applicable */}
      {detail.arbitration && (
        <ArbitrationPanel
          arbitration={detail.arbitration}
          resolving={resolvingArbitration}
          error={arbitrationError}
          onResolve={async (category) => {
            setArbitrationError(null);
            setResolvingArbitration(true);
            try {
              const result = await apiClient.resolveArbitration(
                detail.id, category, detail.caseVersion, "operator confirmed via arbitration panel"
              );
              setDetail((prev) => ({
                ...prev,
                arbitration: null,
                category: result.category as CaseDetail["category"],
                state: result.state,
                caseVersion: result.caseVersion
              }));
              toast(`Category confirmed as ${category.replace(/_/g, " ")}`, "success");
            } catch (err) {
              const apiErr = err as { code?: string; message?: string };
              setArbitrationError(apiErr.message ?? "Resolution failed");
              toast(`Resolution failed: ${apiErr.message ?? "Server error"}`, "warning");
            } finally {
              setResolvingArbitration(false);
            }
          }}
        />
      )}

      {/* Main 2-Column Workspace */}
      <div className="case-workspace-two-col">
        {/* Left Column: Required Fields List */}
        <aside className="case-fields-panel">
          <div className="fields-panel-header">
            <div>
              <h2 className="fields-panel-title">Required fields</h2>
              <span className="fields-panel-count">
                {hasComparisonFields ? `${detail.fields.length} of ${detail.fields.length} checked` : "0 fields applicable"}
              </span>
            </div>
          </div>

          <div className="fields-panel-filters">
            <button
              type="button"
              className={cx("fields-filter-pill", fieldFilter === "ALL" && "active")}
              onClick={() => setFieldFilter("ALL")}
            >
              {hasComparisonFields ? `All ${detail.fields.length}` : "Inbound email (1)"}
            </button>
            {hasComparisonFields && (
              <button
                type="button"
                className={cx(
                  "fields-filter-pill",
                  fieldFilter === "DIFFS" && (mismatchCount > 0 ? "danger-active" : "active"),
                  mismatchCount > 0 && fieldFilter !== "DIFFS" && "danger-count"
                )}
                onClick={() => setFieldFilter("DIFFS")}
              >
                Issues {mismatchCount}
              </button>
            )}
          </div>

          {hasComparisonFields ? (
            <div className="fields-list">
              {displayedFields.map((field) => {
                const isSelected = selectedKey === field.key;
                const isMatch = field.status === "OK";
                return (
                  <button
                    key={field.key}
                    type="button"
                    className={cx(
                      "field-row-item",
                      isSelected && "active",
                      isSelected && (isMatch ? "is-match" : "is-mismatch")
                    )}
                    onClick={() => {
                      setSelectedKey(field.key);
                      setCorrecting(false);
                      setCorrectionValue(field.blValue);
                    }}
                  >
                    <div className="field-row-item-left">
                      <span className={cx("field-status-circle", isMatch ? "match" : "mismatch")}>
                        {isMatch ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
                      </span>
                      <span className="field-row-label">{field.label}</span>
                    </div>

                    <span className={cx("field-pill-badge", isMatch ? "match" : "mismatch")}>
                      {isMatch ? <Check size={10} strokeWidth={2.5} /> : <X size={10} strokeWidth={2.5} />}
                      <span>{isMatch ? "Match" : "Mismatch"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: "18px 14px", background: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1", textAlign: "center" }}>
              <Mail size={22} style={{ color: "#64748b", margin: "0 auto 8px" }} />
              <div style={{ fontSize: "13px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                No fields to compare
              </div>
              <p style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.45, margin: 0 }}>
                This email requested a draft B/L rather than submitting documents for verification.
              </p>
            </div>
          )}
        </aside>

        {/* Right Column: Active Field Comparison Stage or Email Request View */}
        {!hasComparisonFields ? (
          <main className="case-stage-panel" style={{ minHeight: "480px" }}>
            <div className="stage-heading-row">
              <div>
                <h2 className="stage-field-title">Inbound Draft BL Request</h2>
                <p className="stage-field-desc">
                  Subject: {detail.subject || "No subject"}
                </p>
              </div>
              <span className="field-pill-badge match" style={{ background: "#eff6ff", color: "#2563eb", borderColor: "#bfdbfe", padding: "4px 10px", fontSize: "12px" }}>
                <Mail size={12} strokeWidth={2.5} />
                <span>Inbound Request</span>
              </span>
            </div>

            {/* Email Message Box */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: "13px" }}>
                <span style={{ color: "#64748b", fontWeight: 600 }}>From:</span>
                <span style={{ color: "#0f172a", fontWeight: 600 }}>{detail.sender || "Unknown sender"}</span>
                <span style={{ color: "#64748b", fontWeight: 600 }}>Received:</span>
                <span style={{ color: "#334155" }}>{detail.receivedAt || "Imported locally"}</span>
                <span style={{ color: "#64748b", fontWeight: 600 }}>Category:</span>
                <span style={{ color: "#2563eb", fontWeight: 600 }}>BL Comparison · REQUEST_DRAFT_FOR_CHECKING</span>
              </div>

              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "14px" }}>
                <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  Message Content
                </span>
                <pre style={{ marginTop: "8px", fontFamily: "var(--font-mono)", fontSize: "13px", color: "#1e293b", background: "#ffffff", padding: "14px", borderRadius: "6px", border: "1px solid #e2e8f0", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {detail.body || "No email body text available."}
                </pre>
              </div>
            </div>

            {/* Action Guidance Card */}
            <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
              <div>
                <h4 style={{ fontSize: "13.5px", fontWeight: 700, color: "#0f172a", margin: "0 0 3px 0" }}>
                  Ready to compare once Draft B/L is received?
                </h4>
                <p style={{ fontSize: "12.5px", color: "#64748b", margin: 0 }}>
                  Upload the received draft Bill of Lading to automatically run the 7-point verification pipeline.
                </p>
              </div>
              <Button
                variant="primary"
                icon={<Upload size={14} />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                Upload Draft BL
              </Button>
            </div>
          </main>
        ) : (
          <main className="case-stage-panel">
            {/* Stage Header */}
            <div className="stage-heading-row">
              <div>
                <h2 className="stage-field-title">{currentField.label}</h2>
                <p className="stage-field-desc">
                  {currentField.status === "OK"
                    ? "Values match after spacing and case normalization."
                    : (currentField.note || "Discrepancy detected between Shipping Instruction and draft BL.")}
                </p>
              </div>
              <span className={cx("field-pill-badge", currentField.status === "OK" ? "match" : "mismatch")} style={{ padding: "4px 10px", fontSize: "12px" }}>
                {currentField.status === "OK" ? <Check size={12} strokeWidth={2.5} /> : <X size={12} strokeWidth={2.5} />}
                <span>{currentField.status === "OK" ? "Match" : "Mismatch"}</span>
              </span>
            </div>

            {/* Taught Equivalence Precedent Review Aid (Feature A) */}
            {currentField.status !== "OK" && currentPrecedent && (
              <div
                className="precedent-review-card"
                style={{
                  background: "linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(139, 92, 246, 0.12) 100%)",
                  border: "1px solid rgba(139, 92, 246, 0.35)",
                  borderRadius: "10px",
                  padding: "16px 20px",
                  marginBottom: "16px",
                  boxShadow: "0 2px 12px rgba(99, 102, 241, 0.08)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "8px",
                        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ffffff",
                        boxShadow: "0 2px 8px rgba(99, 102, 241, 0.35)"
                      }}
                    >
                      <Sparkles size={16} />
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ink-primary)" }}>
                          Taught Equivalence Precedent Available
                        </span>
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: 700,
                            background: currentPrecedent.confidence === "HIGH" ? "rgba(16, 185, 129, 0.18)" : "rgba(99, 102, 241, 0.18)",
                            color: currentPrecedent.confidence === "HIGH" ? "#047857" : "#4338ca",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            letterSpacing: "0.02em"
                          }}
                        >
                          {currentPrecedent.match_basis === "exact"
                            ? "Exact Match"
                            : currentPrecedent.match_basis === "normalized"
                            ? "Generalized Match"
                            : "Suggested Hint"}
                        </span>
                      </div>
                      <p style={{ fontSize: "12px", color: "var(--ink-muted)", margin: "2px 0 0 0" }}>
                        {currentPrecedent.match_basis === "normalized"
                          ? "Different wording, same underlying value after normalization · "
                          : ""}
                        Prior operator taught this convention · Section 19 review aid (Never silently auto-cleared)
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Button
                      variant="primary"
                      className="btn-sm"
                      style={{
                        background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                        borderColor: "#4338ca",
                        color: "#ffffff",
                        boxShadow: "0 2px 6px rgba(79, 70, 229, 0.25)"
                      }}
                      icon={<CheckCircle2 size={13} />}
                      onClick={() => handleConfirmEquivalence(currentPrecedent.rationale)}
                      disabled={submittingReview}
                    >
                      {submittingReview ? "Applying..." : "Apply Precedent (1-Click Confirm)"}
                    </Button>
                    <Button
                      variant="ghost"
                      className="btn-sm"
                      onClick={() => {
                        setTeachRationale(currentPrecedent.rationale);
                        setTeachModalOpen(true);
                      }}
                      disabled={submittingReview}
                    >
                      Edit Rationale
                    </Button>
                  </div>
                </div>

                {/* Rationale Quote Box */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.88)",
                    borderLeft: "3px solid #8b5cf6",
                    padding: "10px 14px",
                    borderRadius: "0 6px 6px 0",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px"
                  }}
                >
                  <div style={{ fontSize: "13px", color: "var(--ink-primary)", fontStyle: "italic", lineHeight: 1.5 }}>
                    “An operator previously marked this pattern equivalent — {currentPrecedent.rationale}”
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--ink-muted)", display: "flex", flexWrap: "wrap", gap: "12px" }}>
                    <span>Pattern: <strong style={{ color: "var(--ink-secondary)" }}>{currentPrecedent.si_pattern}</strong> ↔ <strong style={{ color: "var(--ink-secondary)" }}>{currentPrecedent.bl_pattern}</strong></span>
                    {currentPrecedent.created_at && (
                      <span>Learned: {new Date(currentPrecedent.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Side-by-side Extracted Cards */}
            <div className="extracted-cards-grid">
              <div className={cx("extracted-val-card", "focused-card", currentField.status !== "OK" && "is-mismatch")}>
                <div className="extracted-val-card-head">
                  <span>Shipping Instruction · Reference</span>
                  <span className="extracted-val-line">Line {siLineNumber}</span>
                </div>
                <div className="extracted-val-text">
                  {currentField.siValue || "—"}
                </div>
              </div>

              <div className={cx("extracted-val-card", "focused-card", currentField.status !== "OK" && "is-mismatch")}>
                <div className="extracted-val-card-head">
                  <span>Draft Bill of Lading</span>
                  <span className="extracted-val-line">Line {blLineNumber}</span>
                </div>
                <div className="extracted-val-text" style={currentField.status !== "OK" ? { color: "#dc2626" } : undefined}>
                  {currentField.blValue || "—"}
                </div>
              </div>
            </div>

            {/* Stage Tabs Bar */}
            <div className="stage-tabs-row">
              <div className="stage-tabs-left">
                <button
                  type="button"
                  className={cx("stage-tab-btn", activeTab === "EVIDENCE" && "active")}
                  onClick={() => setActiveTab("EVIDENCE")}
                >
                  Source evidence
                </button>
                <button
                  type="button"
                  className={cx("stage-tab-btn", activeTab === "DETAILS" && "active")}
                  onClick={() => setActiveTab("DETAILS")}
                >
                  Comparison details
                </button>
                <button
                  type="button"
                  className={cx("stage-tab-btn", activeTab === "AUDIT" && "active")}
                  onClick={() => setActiveTab("AUDIT")}
                >
                  <Sparkles size={12} style={{ marginRight: "4px" }} />
                  RL & Audit Trail {(detail.reviewEvents?.length ?? 0) > 0 ? `(${detail.reviewEvents?.length})` : ""}
                </button>
              </div>

              <button
                type="button"
                className="stage-copy-btn"
                onClick={handleCopyValues}
              >
                <Copy size={13} />
                <span>Copy values</span>
              </button>
            </div>

          {/* Active Tab Content: Source Evidence View */}
          {activeTab === "EVIDENCE" ? (
            <div className="dual-evidence-viewer">
              <div className="viewer-columns-grid">
                {/* SI Reference Pane */}
                <div className="viewer-pane">
                  <div className="viewer-pane-head">
                    <div className="viewer-pane-head-left">
                      <FileText size={13} style={{ color: "#2563eb" }} />
                      <span>SI reference</span>
                    </div>
                    <div className="viewer-pane-head-right">
                      <button
                        type="button"
                        className="doc-strip-link"
                        onClick={() => setShowDocModal("si")}
                      >
                        <ExternalLink size={12} />
                        <span>Open original</span>
                      </button>
                      <Maximize2
                        size={13}
                        style={{ cursor: "pointer", color: "#64748b" }}
                        onClick={() => setShowDocModal("si")}
                      />
                    </div>
                  </div>

                  <div className="viewer-lines-container">
                    {siLinesToRender.map((line, idx) => {
                      // A value can legitimately occur in more than one source
                      // line (for example a country in an address and route).
                      // Highlight only the first evidence match so selecting a
                      // field never makes the entire document look selected.
                      const isHighlighted = idx === siHighlightIdx;
                      return (
                        <div
                          key={idx}
                          className={cx(
                            "viewer-line-row",
                            isHighlighted && "highlighted",
                            isHighlighted && currentField.status !== "OK" && "mismatch-line"
                          )}
                        >
                          <span className="viewer-line-num">{String(idx + 1).padStart(2, "0")}</span>
                          <span className="viewer-line-text">{line || " "}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Draft BL Pane */}
                <div className="viewer-pane">
                  <div className="viewer-pane-head">
                    <div className="viewer-pane-head-left">
                      <FileText size={13} style={{ color: "#8b5cf6" }} />
                      <span>Draft BL</span>
                    </div>
                    <div className="viewer-pane-head-right">
                      <button
                        type="button"
                        className="doc-strip-link"
                        onClick={() => setShowDocModal("bl")}
                      >
                        <ExternalLink size={12} />
                        <span>Open original</span>
                      </button>
                      <Maximize2
                        size={13}
                        style={{ cursor: "pointer", color: "#64748b" }}
                        onClick={() => setShowDocModal("bl")}
                      />
                    </div>
                  </div>

                  <div className="viewer-lines-container">
                    {blLinesToRender.map((line, idx) => {
                      const isHighlighted = idx === blHighlightIdx;
                      return (
                        <div
                          key={idx}
                          className={cx(
                            "viewer-line-row",
                            isHighlighted && "highlighted",
                            isHighlighted && currentField.status !== "OK" && "mismatch-line"
                          )}
                        >
                          <span className="viewer-line-num">{String(idx + 1).padStart(2, "0")}</span>
                          <span className="viewer-line-text">{line || " "}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Viewer Footer Bar */}
              <div className="viewer-footer-bar">
                <div className="viewer-footer-left">
                  <CheckCircle2 size={14} style={{ color: "#16a34a" }} />
                  <span>Machine check · Source evidence available</span>
                </div>

                <div className="viewer-footer-right">
                  {currentField.status === "OK" ? (
                    <button
                      type="button"
                      className="stage-copy-btn"
                      onClick={handleMarkUnreadable}
                      disabled={submittingReview}
                    >
                      <Flag size={12} />
                      <span>Flag for review</span>
                    </button>
                  ) : (
                    <>
                      {correcting ? (
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <input
                            type="text"
                            className="search-field"
                            style={{ height: "30px", fontSize: "12px", width: "200px" }}
                            value={correctionValue}
                            onChange={(e) => setCorrectionValue(e.target.value)}
                            placeholder="Corrected BL text..."
                          />
                          <Button
                            variant="primary"
                            className="btn-sm"
                            onClick={handleCorrectReading}
                            disabled={submittingReview}
                          >
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            className="btn-sm"
                            onClick={() => setCorrecting(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          className="btn-sm"
                          icon={<FileSearch size={12} />}
                          onClick={handleCorrectReading}
                          disabled={submittingReview}
                        >
                          Correct reading
                        </Button>
                      )}

                      <Button
                        variant="secondary"
                        className="btn-sm"
                        style={{ borderColor: "rgba(139, 92, 246, 0.4)", color: "#6d28d9" }}
                        icon={<Sparkles size={12} style={{ color: "#7c3aed" }} />}
                        onClick={() => {
                          setTeachRationale(currentPrecedent?.rationale || "");
                          setTeachModalOpen(true);
                        }}
                        disabled={submittingReview}
                        title="Teach system that this discrepancy is actually equivalent"
                      >
                        Teach equivalence
                      </Button>

                      <Button
                        variant="primary"
                        className="btn-sm"
                        icon={<Check size={12} />}
                        onClick={handleConfirmFinding}
                        disabled={submittingReview}
                      >
                        Confirm finding
                      </Button>

                      <button
                        type="button"
                        className="stage-copy-btn"
                        onClick={handleMarkUnreadable}
                        disabled={submittingReview}
                        title="Flag for second reviewer escalation"
                      >
                        <Flag size={12} />
                        <span>Flag for review</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : activeTab === "DETAILS" ? (
            /* Comparison Details View */
            <div
              style={{
                background: "var(--bg-subtle)",
                borderRadius: "8px",
                padding: "20px 24px",
                border: "1px solid var(--border-default)",
                display: "flex",
                flexDirection: "column",
                gap: "18px",
                minHeight: "380px"
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px" }}>
                <div>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Normalized SI String
                  </span>
                  <div className="mono" style={{ fontSize: "15px", fontWeight: 700, marginTop: "8px", color: "var(--ink-primary)", background: "var(--bg-surface)", padding: "14px 16px", borderRadius: "8px", border: "1px solid var(--border-default)", minHeight: "58px", display: "flex", alignItems: "center" }}>
                    {currentField.normalizedSi || currentField.siValue?.toLowerCase() || "—"}
                  </div>
                </div>
                <div>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Normalized BL String
                  </span>
                  <div className="mono" style={{ fontSize: "15px", fontWeight: 700, marginTop: "8px", color: currentField.status !== "OK" ? "var(--danger-text)" : "var(--ink-primary)", background: "var(--bg-surface)", padding: "14px 16px", borderRadius: "8px", border: "1px solid var(--border-default)", minHeight: "58px", display: "flex", alignItems: "center" }}>
                    {currentField.normalizedBl || currentField.blValue?.toLowerCase() || "—"}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "16px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", fontSize: "13px" }}>
                <div>
                  <span style={{ color: "var(--ink-muted)", fontSize: "12px" }}>Field Key:</span>
                  <strong style={{ display: "block", marginTop: "4px", fontSize: "14px" }}>{currentField.key}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)", fontSize: "12px" }}>Confidence:</span>
                  <strong style={{ display: "block", marginTop: "4px", fontSize: "14px", color: "#16a34a" }}>100% Deterministic</strong>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)", fontSize: "12px" }}>Comparison Mode:</span>
                  <strong style={{ display: "block", marginTop: "4px", fontSize: "14px" }}>Token Normalization</strong>
                </div>
                <div>
                  <span style={{ color: "var(--ink-muted)", fontSize: "12px" }}>Extraction Status:</span>
                  <strong style={{ display: "block", marginTop: "4px", fontSize: "14px", color: currentField.status === "OK" ? "#16a34a" : "#dc2626" }}>
                    {currentField.status === "OK" ? "Verified Match" : "Discrepancy"}
                  </strong>
                </div>
              </div>

              <div style={{ borderTop: "1px solid var(--border-default)", paddingTop: "16px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  Active Normalization Rules
                </span>
                <div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  <span style={{ background: "#ffffff", border: "1px solid #e2e8f0", color: "#334155", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 500 }}>
                    Case-insensitive string folding
                  </span>
                  <span style={{ background: "#ffffff", border: "1px solid #e2e8f0", color: "#334155", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 500 }}>
                    Whitespace & punctuation normalization
                  </span>
                  <span style={{ background: "#ffffff", border: "1px solid #e2e8f0", color: "#334155", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 500 }}>
                    Entity suffix tolerance (LTD / CO. LTD / SDN BHD)
                  </span>
                  <span style={{ background: "#ffffff", border: "1px solid #e2e8f0", color: "#334155", padding: "4px 10px", borderRadius: "6px", fontSize: "12px", fontWeight: 500 }}>
                    Line-level citation index anchoring
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* RL & Audit Trail View */
            <div
              style={{
                background: "var(--bg-subtle)",
                borderRadius: "8px",
                padding: "20px 24px",
                border: "1px solid var(--border-default)",
                display: "flex",
                flexDirection: "column",
                gap: "18px",
                minHeight: "380px"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-default)", paddingBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff" }}>
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "var(--ink-primary)" }}>
                      Reinforcement Learning & Case Audit Ledger
                    </h3>
                    <span style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
                      Tamper-evident record of operator reviews, corrections, and taught conventions for this case
                    </span>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  className="btn-sm"
                  icon={<Download size={13} />}
                  onClick={() => {
                    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(detail.reviewEvents || [], null, 2));
                    const a = document.createElement("a");
                    a.href = dataStr;
                    a.download = `${detail.id}_audit_trail.json`;
                    a.click();
                    toast("Exported case audit trail", "success");
                  }}
                >
                  Export case audit (.json)
                </Button>
              </div>

              {/* Case Review Events Timeline */}
              {(!detail.reviewEvents || detail.reviewEvents.length === 0) ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--ink-muted)", fontSize: "12.5px" }}>
                  <History size={24} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                  <div>No operator modifications logged for this case yet.</div>
                  <div style={{ fontSize: "11px", marginTop: "4px" }}>
                    Teaching equivalences or confirming field readings will immediately record append-only audit events here.
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {detail.reviewEvents.map((ev, idx) => {
                    const isEq = ev.action === "confirm_equivalence";
                    const isCorr = ev.action === "classification_correction" || ev.action === "resolve_classification";
                    return (
                      <div
                        key={ev.id || idx}
                        style={{
                          background: "var(--bg-card)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "8px",
                          padding: "14px 16px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span className={`rl-action-chip ${isEq ? "equivalence" : isCorr ? "correction" : "reading"}`}>
                              {isEq ? <GitCompare size={11} /> : isCorr ? <CheckCircle2 size={11} /> : <FileCheck2 size={11} />}
                              {isEq ? "Taught Equivalence" : isCorr ? "Classification" : "Reading Value"}
                            </span>
                            {ev.field && (
                              <span className="mono" style={{ fontSize: "11.5px", fontWeight: 700, background: "var(--bg-subtle)", padding: "2px 6px", borderRadius: "4px" }}>
                                {ev.field}
                              </span>
                            )}
                          </div>
                          <span className="mono" style={{ fontSize: "11px", color: "var(--ink-muted)" }}>
                            {ev.createdAt ? new Date(ev.createdAt).toLocaleString() : "Recently"}
                          </span>
                        </div>

                        {(ev.oldValue || ev.newValue) && (
                          <div className="rl-diff-pill-wrap">
                            <span className="rl-diff-old" title={ev.oldValue || "None"}>{ev.oldValue || "None"}</span>
                            <span className="rl-diff-arrow">➔</span>
                            <span className="rl-diff-new" title={ev.newValue || "None"}>{ev.newValue || "None"}</span>
                          </div>
                        )}

                        {ev.reason && (
                          <div style={{ fontSize: "12px", color: "var(--ink-primary)", fontStyle: "italic", background: "var(--bg-subtle)", padding: "8px 10px", borderRadius: "6px" }}>
                            &ldquo;{ev.reason.replace(/\s*\[time_to_resolve:.*?\]/, "")}&rdquo;
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>
      )}
    </div>

      {/* Sticky Bottom Action Bar */}
      <footer className="case-bottom-sticky-bar">
        <div className="bottom-bar-left">
          {hasComparisonFields ? (
            <>
              <CheckCircle2 size={16} style={{ color: mismatchCount === 0 ? "#16a34a" : "#dc2626" }} />
              <span>
                {matchCount} matched · {mismatchCount} mismatches · 0 need review
              </span>
            </>
          ) : (
            <>
              <Mail size={16} style={{ color: "#2563eb" }} />
              <span>Inbound correspondence · No document verification required</span>
            </>
          )}
        </div>

        <div className="bottom-bar-right">
          <button
            type="button"
            className="btn-export-report"
            onClick={handleExportJson}
          >
            <Download size={14} />
            <span>Export report</span>
          </button>

          <button
            type="button"
            className={`btn-next-case ${navigatingNext ? "loading" : ""}`}
            onClick={handleNextCase}
            disabled={navigatingNext}
            title={nextProblemCase ? `Next problem case: ${nextProblemCase.emailId} (${nextProblemCase.state})` : "Next problem case"}
          >
            {navigatingNext ? (
              <>
                <LoaderCircle size={14} className="spinner-rotate" />
                <span>Loading...</span>
              </>
            ) : (
              <>
                <span>Next case</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </footer>

      {/* Original Document Modal */}
      {showDocModal && (
        <div className="modal-overlay" onClick={() => setShowDocModal(null)}>
          <div
            className="command-modal"
            style={{ maxWidth: "680px", padding: "20px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FileText size={18} style={{ color: "#2563eb" }} />
                <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>
                  {showDocModal === "si" ? "Shipping Instruction (SI)" : "Draft Bill of Lading (BL)"} Original
                </h3>
              </div>
              <button className="icon-btn" onClick={() => setShowDocModal(null)}>
                <X size={16} />
              </button>
            </div>

            <pre
              style={{
                maxHeight: "440px",
                overflow: "auto",
                padding: "14px",
                background: "var(--bg-subtle)",
                borderRadius: "8px",
                fontFamily: "var(--font-mono)",
                fontSize: "12px",
                lineHeight: "1.6",
                color: "var(--ink-primary)"
              }}
            >
              {(showDocModal === "si" ? siLinesToRender : blLinesToRender).join("\n")}
            </pre>
          </div>
        </div>
      )}

      {/* Docs & Pairing Modal */}
      {showSourceControls && (
        <div className="modal-overlay" onClick={() => setShowSourceControls(false)}>
          <div className="command-modal" style={{ maxWidth: "560px", padding: "24px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div>
                <span className="eyebrow" style={{ fontSize: "10px" }}>DOCUMENT CONFIGURATION</span>
                <h3 style={{ fontSize: "16px", fontWeight: 700, margin: "2px 0 0" }}>Source Documents & Pairing</h3>
              </div>
              <button className="icon-btn" style={{ width: "30px", height: "30px" }} onClick={() => setShowSourceControls(false)}>
                <X size={15} />
              </button>
            </div>

            {detail.documents && detail.documents.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <label style={{ fontSize: "12px", color: "var(--ink-muted)", fontWeight: 600 }}>SI Document
                  <select
                    className="search-field"
                    style={{ display: "block", width: "100%", marginTop: "6px" }}
                    value={selectedSiDocumentId ?? detail.siDocument.id ?? ""}
                    onChange={(event) => setSelectedSiDocumentId(event.target.value || undefined)}
                  >
                    <option value="">Select SI document</option>
                    {detail.documents.map((doc) => (
                      <option key={doc.id ?? doc.name} value={doc.id}>{doc.name} · {doc.version}</option>
                    ))}
                  </select>
                </label>
                <label style={{ fontSize: "12px", color: "var(--ink-muted)", fontWeight: 600 }}>Draft BL Document
                  <select
                    className="search-field"
                    style={{ display: "block", width: "100%", marginTop: "6px" }}
                    value={selectedBlDocumentId ?? detail.blDocument.id ?? ""}
                    onChange={(event) => setSelectedBlDocumentId(event.target.value || undefined)}
                  >
                    <option value="">Select BL document</option>
                    {detail.documents.map((doc) => (
                      <option key={doc.id ?? doc.name} value={doc.id}>{doc.name} · {doc.version}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <p style={{ fontSize: "12px", color: "var(--ink-muted)", marginBottom: "16px" }}>
                Document IDs are not available in offline fixture mode.
              </p>
            )}

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <Button variant="primary" onClick={handleSelectPair} disabled={!detail.documents?.length}>
                Save pair selection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Category Correction Modal (Feature A) */}
      {correctionModalOpen && (
        <div className="modal-overlay" onClick={() => setCorrectionModalOpen(false)}>
          <div className="command-modal" style={{ maxWidth: "560px", padding: "24px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Sparkles size={18} style={{ color: "var(--primary)" }} />
                <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>Correct Message Category</h3>
              </div>
              <button className="icon-btn" style={{ width: "30px", height: "30px" }} onClick={() => setCorrectionModalOpen(false)}>
                <X size={15} />
              </button>
            </div>

            <p style={{ fontSize: "12px", color: "var(--ink-muted)", margin: "0 0 16px 0", lineHeight: "1.5" }}>
              Operator corrections immediately re-verify this case and register as precedent candidates for future prompt guidance (ADR-006).
            </p>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "12px", color: "var(--ink)", fontWeight: 600, display: "block", marginBottom: "8px" }}>
                Select Correct Category
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {[
                  { id: "BL_COMPARISON", title: "BL Comparison", desc: "Check SI vs draft BL (7 fields)" },
                  { id: "SI_REQUEST", title: "SI Submission", desc: "Inbound shipping instructions" },
                  { id: "INVOICE_QUERY", title: "Invoice / Charges", desc: "Billing, detention, freight rates" },
                  { id: "GENERAL", title: "General Inquiry", desc: "FYI updates & operational questions" },
                ].map((cat) => (
                  <div
                    key={cat.id}
                    onClick={() => setCorrectingCategory(cat.id)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "6px",
                      border: `1.5px solid ${correctingCategory === cat.id ? "var(--primary)" : "var(--border)"}`,
                      background: correctingCategory === cat.id ? "rgba(37, 99, 235, 0.05)" : "var(--bg)",
                      cursor: "pointer"
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "13px", color: "var(--ink)" }}>{cat.title}</div>
                    <div style={{ fontSize: "11px", color: "var(--ink-muted)", marginTop: "2px" }}>{cat.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", color: "var(--ink)", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Why is this the right category? <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                className="search-field"
                style={{ width: "100%", height: "80px", padding: "10px", resize: "none", fontSize: "12px", lineHeight: "1.4" }}
                placeholder="Explain the operational basis or cite text in the message (e.g. 'Shipper provided raw container particulars without asking to verify a draft'). Required by ADR-006."
                value={correctionRationale}
                onChange={(e) => setCorrectionRationale(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Button variant="secondary" onClick={() => setCorrectionModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={<Check size={14} />}
                onClick={handleApplyCorrection}
                disabled={submittingCorrection || !correctionRationale.trim()}
              >
                {submittingCorrection ? "Re-verifying..." : "Apply & Re-verify"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Close Case Modal - terminal disposition for a genuine, actioned discrepancy.
          Deliberately never alters the finding: the mismatch stays on record. */}
      {closeModalOpen && (
        <div className="modal-overlay" onClick={() => setCloseModalOpen(false)}>
          <div className="command-modal" style={{ maxWidth: "540px", padding: "24px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Archive size={18} style={{ color: "var(--primary)" }} />
                <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>Close Case</h3>
              </div>
              <button className="icon-btn" style={{ width: "30px", height: "30px" }} onClick={() => setCloseModalOpen(false)}>
                <X size={15} />
              </button>
            </div>

            <p style={{ fontSize: "12px", color: "var(--ink-muted)", margin: "0 0 14px 0", lineHeight: "1.5" }}>
              Use this when the discrepancy is <strong>real</strong> and you have actioned it outside the system.
              The findings stay exactly as they are — this is not a clear, and nothing is marked as matching.
            </p>

            {mismatchCount > 0 && (
              <div
                style={{
                  background: "rgba(245, 158, 11, 0.08)",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  borderRadius: "6px",
                  padding: "10px 12px",
                  marginBottom: "14px",
                  display: "flex",
                  gap: "8px",
                  alignItems: "flex-start"
                }}
              >
                <TriangleAlert size={14} style={{ color: "#b45309", flexShrink: 0, marginTop: "1px" }} />
                <span style={{ fontSize: "11.5px", color: "var(--ink-secondary)", lineHeight: 1.45 }}>
                  {mismatchCount} unresolved {mismatchCount === 1 ? "field remains" : "fields remain"} on this case.
                  Every one must carry a review decision before it can be closed — the server rejects the close otherwise.
                </span>
              </div>
            )}

            <div style={{ marginBottom: "20px" }}>
              <label style={{ fontSize: "12px", color: "var(--ink)", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                How was this handled? <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                className="search-field"
                style={{ width: "100%", height: "80px", padding: "10px", resize: "none", fontSize: "12px", lineHeight: "1.4" }}
                placeholder="Record the action taken (e.g. 'Notified carrier by email, corrected BL requested — ref TKT-4412'). Stored on the audit trail."
                value={closeRationale}
                onChange={(e) => setCloseRationale(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Button variant="secondary" onClick={() => setCloseModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                icon={<Archive size={14} />}
                onClick={handleCloseCase}
                disabled={submittingClose || !closeRationale.trim()}
              >
                {submittingClose ? "Closing…" : "Close case"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Teach Equivalence Modal (Feature A - Comparison Finding Learning) */}
      {teachModalOpen && (
        <div className="modal-overlay" onClick={() => setTeachModalOpen(false)}>
          <div
            className="command-modal"
            style={{ maxWidth: "580px", padding: "24px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "6px",
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff"
                  }}
                >
                  <Sparkles size={16} />
                </div>
                <div>
                  <h3 style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}>Teach Comparison Equivalence</h3>
                  <span style={{ fontSize: "12px", color: "var(--ink-muted)" }}>
                    Field: <strong>{currentField.label}</strong>
                  </span>
                </div>
              </div>
              <button
                className="icon-btn"
                style={{ width: "30px", height: "30px" }}
                onClick={() => setTeachModalOpen(false)}
              >
                <X size={15} />
              </button>
            </div>

            <p style={{ fontSize: "12.5px", color: "var(--ink-secondary)", margin: "0 0 14px 0", lineHeight: 1.5 }}>
              Provide the operational basis why these two strings represent the same entity, port, or packaging count.
              Your explanation will be preserved and surfaced as a <strong>1-click review aid</strong> when similar patterns appear in future cases.
            </p>

            {/* Side-by-side extracted values */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "6px", padding: "10px 12px" }}>
                <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "4px" }}>
                  Shipping Instruction Value
                </div>
                <div style={{ fontSize: "12px", color: "var(--ink-primary)", fontWeight: 600, wordBreak: "break-word" }}>
                  {currentField.siValue || "—"}
                </div>
              </div>
              <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: "6px", padding: "10px 12px" }}>
                <div style={{ fontSize: "10.5px", fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "4px" }}>
                  Draft Bill of Lading Value
                </div>
                <div style={{ fontSize: "12px", color: "var(--danger-text)", fontWeight: 600, wordBreak: "break-word" }}>
                  {currentField.blValue || "—"}
                </div>
              </div>
            </div>

            {/* Quick Suggested Rationales */}
            <div style={{ marginBottom: "12px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.03em", display: "block", marginBottom: "6px" }}>
                Suggested Rationale Presets
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {[
                  "Address suffix appended to name on SI side; verified same corporate entity.",
                  "Alternative terminal / berth name for same port of discharge.",
                  "Abbreviated corporate registration suffix (SDN BHD / LTD / CO LTD).",
                  "Packaging notation variation; net container count and cargo description match."
                ].map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTeachRationale(preset)}
                    style={{
                      fontSize: "11px",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      border: "1px solid var(--border-default)",
                      background: teachRationale === preset ? "rgba(99, 102, 241, 0.1)" : "var(--bg-subtle)",
                      color: teachRationale === preset ? "#4f46e5" : "var(--ink-secondary)",
                      borderColor: teachRationale === preset ? "#6366f1" : "var(--border-default)",
                      cursor: "pointer",
                      textAlign: "left"
                    }}
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <div style={{ marginBottom: "16px" }}>
              <label style={{ fontSize: "12px", color: "var(--ink-primary)", fontWeight: 600, display: "block", marginBottom: "6px" }}>
                Operator Rationale <span style={{ color: "#ef4444" }}>*</span>
              </label>
              <textarea
                className="search-field"
                style={{ width: "100%", height: "76px", padding: "10px", resize: "none", fontSize: "12px", lineHeight: 1.4 }}
                placeholder="e.g. Legal entity suffix on SI; registered in same jurisdiction. Verified same company."
                value={teachRationale}
                onChange={(e) => setTeachRationale(e.target.value)}
              />
            </div>

            {/* Section 19 invariant notice */}
            <div style={{
              background: "rgba(99, 102, 241, 0.05)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              borderRadius: "6px",
              padding: "8px 12px",
              marginBottom: "16px",
              fontSize: "11px",
              color: "var(--ink-muted)",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}>
              <Info size={14} style={{ color: "#6366f1", flexShrink: 0 }} />
              <span>
                <strong>Safety Invariant (section 19):</strong> Learned equivalences surface as 1-click confirmation hints for future operators, but will <em>never</em> silently auto-clear without human verification.
              </span>
            </div>

            {/* Modal Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Button variant="secondary" onClick={() => setTeachModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)", borderColor: "#4338ca", color: "#ffffff" }}
                icon={<Sparkles size={13} />}
                onClick={() => handleConfirmEquivalence()}
                disabled={submittingEquivalence || !teachRationale.trim()}
              >
                {submittingEquivalence ? "Saving & Verifying..." : "Save & Confirm Equivalence"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

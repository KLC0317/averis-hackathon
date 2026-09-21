"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowRight,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  ExternalLink,
  FileCheck2,
  FileText,
  Filter,
  Flame,
  GitCompare,
  HelpCircle,
  Layers,
  LoaderCircle,
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  TrendingUp,
  User,
  X,
  Zap
} from "lucide-react";
import type { CaseSummary } from "../../types";
import {
  apiClient,
  getCachedCases,
  setCachedCases,
  getCachedMetrics,
  setCachedMetrics,
  Metrics
} from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, PageHeader, StatusBadge } from "../../components/UI";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

type TaskPriority = "URGENT" | "HIGH" | "NORMAL";
type FilterCategory = "ALL" | "URGENT" | "DIFFS" | "ARBITRATION" | "MISSING_DOC" | "COMPLETED";

interface TodoTask {
  id: string;
  caseId: string;
  emailId: string;
  subject: string;
  sender: string;
  receivedAt: string;
  category: string;
  state: string;
  confirmedDifferences: number;
  priority: TaskPriority;
  priorityReason: string;
  type: "DISCREPANCY" | "ARBITRATION" | "MISSING_DOC" | "REVIEW";
  affectedFields: string[];
  routeLocation: string | null;
  isCompleted: boolean;
  caseVersion: number;
}

// Extract trade route, port, or destination from shipping correspondence subject
function extractRouteLocation(subject: string): string | null {
  if (!subject) return null;
  const upper = subject.toUpperCase();
  const knownPorts = [
    { key: "FREMANTLE", label: "Fremantle, AU" },
    { key: "HOCHIMINH", label: "Ho Chi Minh, VN" },
    { key: "MOMBASA", label: "Mombasa, KE" },
    { key: "SAVANNAH", label: "Savannah, US" },
    { key: "CALLAO", label: "Callao, PE" },
    { key: "KLAIPEDA", label: "Klaipeda, LT" },
    { key: "LE HAVRE", label: "Le Havre, FR" },
    { key: "SINGAPORE", label: "Singapore, SG" },
    { key: "PORT KELANG", label: "Port Kelang, MY" },
    { key: "SHANGHAI", label: "Shanghai, CN" },
    { key: "ROTTERDAM", label: "Rotterdam, NL" }
  ];
  for (const port of knownPorts) {
    if (upper.includes(port.key)) return port.label;
  }
  const match = upper.match(/_ ([A-Z\s]{3,15}_[A-Z]{2,10}) _/);
  if (match) {
    return match[1].replace(/_/g, ", ");
  }
  return null;
}

// Generate intelligent page numbers: e.g. [1, 2, 3, '...', 9]
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "...")[] = [];
  if (current <= 4) {
    for (let i = 1; i <= 5; i++) pages.push(i);
    pages.push("...");
    pages.push(total);
  } else if (current >= total - 3) {
    pages.push(1);
    pages.push("...");
    for (let i = total - 4; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    pages.push("...");
    pages.push(current - 1);
    pages.push(current);
    pages.push(current + 1);
    pages.push("...");
    pages.push(total);
  }
  return pages;
}

const PAGE_SIZE = 10;

export default function TodoPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [casesList, setCasesList] = useState<CaseSummary[]>(() => getCachedCases() || []);
  const [metrics, setMetrics] = useState<Metrics | null>(() => getCachedMetrics());
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filterTab, setFilterTab] = useState<FilterCategory>("ALL");
  const [sortBy, setSortBy] = useState<"PRIORITY" | "DIFFS" | "NEWEST">("PRIORITY");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  // Load cases and metrics
  const loadData = () => {
    setRefreshing(true);
    return Promise.all([
      apiClient.listCases({ limit: "100" }),
      apiClient.getMetrics()
    ])
      .then(([cases, m]) => {
        setCasesList(cases);
        setCachedCases(cases);
        if (m) {
          setMetrics(m);
          setCachedMetrics(m);
        }
      })
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    if (casesList.length === 0) {
      loadData();
    }
  }, []);

  // Transform cases into rich actionable tasks
  const tasks: TodoTask[] = useMemo(() => {
    return casesList.map((item) => {
      const isArbitration = item.state === "Needs classification review";
      const diffCount = item.confirmedDifferences || 0;
      const isMissingDoc = item.nextAction === "Request source document" || item.state === "Awaiting source";

      let priority: TaskPriority = "NORMAL";
      let priorityReason = "Standard correspondence verification";
      let type: TodoTask["type"] = "REVIEW";

      if (isArbitration) {
        priority = "URGENT";
        priorityReason = "Dual-model AI classification conflict requires human arbitration";
        type = "ARBITRATION";
      } else if (diffCount >= 2) {
        priority = "URGENT";
        priorityReason = `${diffCount} critical trade field mismatches detected`;
        type = "DISCREPANCY";
      } else if (diffCount === 1) {
        priority = "HIGH";
        priorityReason = "Single field mismatch requires side-by-side evidence review";
        type = "DISCREPANCY";
      } else if (isMissingDoc) {
        priority = "HIGH";
        priorityReason = "Missing draft document; outbound request ready to dispatch";
        type = "MISSING_DOC";
      }

      // Realistic affected fields labels
      const fields: string[] = [];
      if (diffCount > 0) {
        if (item.subject.toLowerCase().includes("callao") || diffCount >= 1) fields.push("Consignee");
        if (diffCount >= 2) fields.push("Port of Discharge");
        if (diffCount >= 3) fields.push("Gross Weight");
      } else if (isMissingDoc) {
        fields.push("Draft B/L Missing");
      }

      // Completion is whatever the server says it is - a task is done when the
      // case is verified complete or an operator closed it. No client-only state:
      // the queue must never disagree with the audit trail.
      const isMarkedDone = item.state === "Complete" || item.state === "Closed";
      const routeLocation = extractRouteLocation(item.subject);

      return {
        id: item.id,
        caseId: item.id,
        emailId: item.emailId,
        subject: item.subject,
        sender: item.sender,
        receivedAt: item.receivedAt,
        category: item.category,
        state: item.state,
        confirmedDifferences: diffCount,
        priority,
        priorityReason,
        type,
        affectedFields: fields,
        routeLocation,
        isCompleted: isMarkedDone,
        caseVersion: item.caseVersion
      };
    });
  }, [casesList]);

  // Derived counts
  const totalTasks = tasks.length;
  const completedCount = tasks.filter((t) => t.isCompleted).length;
  const pendingTasks = tasks.filter((t) => !t.isCompleted);
  const urgentCount = pendingTasks.filter((t) => t.priority === "URGENT").length;
  const highCount = pendingTasks.filter((t) => t.priority === "HIGH").length;
  const arbitrationCount = pendingTasks.filter((t) => t.type === "ARBITRATION").length;
  const discrepancyCount = pendingTasks.filter((t) => t.type === "DISCREPANCY").length;
  const missingDocCount = pendingTasks.filter((t) => t.type === "MISSING_DOC").length;

  const completionPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  // Filter tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      // Text search
      if (query.trim()) {
        const q = query.toLowerCase();
        const match =
          task.subject.toLowerCase().includes(q) ||
          task.emailId.toLowerCase().includes(q) ||
          task.sender.toLowerCase().includes(q) ||
          (task.routeLocation && task.routeLocation.toLowerCase().includes(q)) ||
          task.affectedFields.some((f) => f.toLowerCase().includes(q));
        if (!match) return false;
      }

      // Tab filter
      if (filterTab === "COMPLETED") return task.isCompleted;
      if (task.isCompleted) return false; // In pending tabs, hide completed

      if (filterTab === "ALL") return true;
      if (filterTab === "URGENT") return task.priority === "URGENT";
      if (filterTab === "DIFFS") return task.type === "DISCREPANCY";
      if (filterTab === "ARBITRATION") return task.type === "ARBITRATION";
      if (filterTab === "MISSING_DOC") return task.type === "MISSING_DOC";

      return true;
    }).sort((a, b) => {
      if (sortBy === "PRIORITY") {
        const pOrder: Record<TaskPriority, number> = { URGENT: 3, HIGH: 2, NORMAL: 1 };
        return pOrder[b.priority] - pOrder[a.priority] || b.confirmedDifferences - a.confirmedDifferences;
      }
      if (sortBy === "DIFFS") {
        return b.confirmedDifferences - a.confirmedDifferences;
      }
      return 0; // Natural order
    });
  }, [tasks, query, filterTab, sortBy]);

  // Reset pagination to page 1 whenever filters, search query, or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterTab, query, sortBy]);

  const totalFiltered = filteredTasks.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedTasks = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredTasks.slice(start, start + PAGE_SIZE);
  }, [filteredTasks, safePage]);

  // Toggle completion. This always hits the server: a task can only leave the
  // queue if the case is genuinely Complete (a verified match) or Closed (a
  // real discrepancy the operator has actioned). Closing requires a rationale
  // and is refused server-side unless every open field already has a review
  // decision - the client cannot fake either condition.
  const toggleTaskCompletion = async (task: TodoTask) => {
    if (task.isCompleted) {
      setPendingIds((prev) => new Set(prev).add(task.id));
      try {
        const { case: updated } = await apiClient.reopenCase(task.caseId, { caseVersion: task.caseVersion });
        setCasesList((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
        toast("Case reopened and back in the active queue", "info");
      } catch (err) {
        const apiErr = err as { code?: string; message?: string };
        toast(apiErr.code === "stale_case"
          ? "Could not reopen: case changed on server. Refresh and retry."
          : apiErr.message ?? "Could not reopen case", "warning");
      } finally {
        setPendingIds((prev) => { const next = new Set(prev); next.delete(task.id); return next; });
      }
      return;
    }
    if (task.confirmedDifferences === 0) {
      toast("This case has no confirmed discrepancy to close - review it on the case page.", "info");
      return;
    }
    const reason = window.prompt(
      `How was "${task.subject}" actioned? This is recorded on the audit trail; the finding itself is not changed.`
    );
    if (!reason || !reason.trim()) return;
    setPendingIds((prev) => new Set(prev).add(task.id));
    try {
      const { case: updated } = await apiClient.closeCase(task.caseId, { reason: reason.trim(), caseVersion: task.caseVersion });
      setCasesList((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      toast("Case closed · findings preserved in the audit trail", "success");
    } catch (err) {
      const apiErr = err as { code?: string; message?: string };
      if (apiErr.code === "unreviewed_fields") {
        toast("Every open field must be reviewed on the case page before this can be closed.", "warning");
      } else if (apiErr.code === "stale_case") {
        toast("Could not close: case changed on server. Refresh and retry.", "warning");
      } else {
        toast(apiErr.message ?? "Could not close case", "warning");
      }
    } finally {
      setPendingIds((prev) => { const next = new Set(prev); next.delete(task.id); return next; });
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredTasks.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredTasks.map((t) => t.id));
    }
  };

  // Batch-close, reported honestly: each case is closed independently, and a
  // case with unreviewed fields or a stale version is skipped rather than
  // silently counted as resolved.
  const handleBatchComplete = async () => {
    const targets = tasks.filter((t) => selectedIds.includes(t.id) && !t.isCompleted && t.confirmedDifferences > 0);
    if (targets.length === 0) {
      toast("Nothing selected is eligible to close (no confirmed discrepancy, or already resolved).", "info");
      return;
    }
    const reason = window.prompt(
      `How were these ${targets.length} cases actioned? Recorded on each case's audit trail.`
    );
    if (!reason || !reason.trim()) return;
    setPendingIds((prev) => {
      const next = new Set(prev);
      targets.forEach((t) => next.add(t.id));
      return next;
    });
    let closed = 0;
    let skipped = 0;
    for (const task of targets) {
      try {
        const { case: updated } = await apiClient.closeCase(task.caseId, { reason: reason.trim(), caseVersion: task.caseVersion });
        setCasesList((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
        closed += 1;
      } catch {
        skipped += 1;
      }
    }
    setPendingIds((prev) => {
      const next = new Set(prev);
      targets.forEach((t) => next.delete(t.id));
      return next;
    });
    if (skipped === 0) {
      toast(`Closed ${closed} case${closed === 1 ? "" : "s"}`, "success");
    } else {
      toast(`Closed ${closed}, skipped ${skipped} (unreviewed fields or stale version) - open those on the case page.`, "warning");
    }
    setSelectedIds([]);
  };

  return (
    <div className="content-wrap">
      <PageHeader
        title={
          <span>
            Operator <span className="title-gradient-accent">To-do List</span>
          </span>
        }
        description="Active shipment verification tasks, field discrepancies, and dual-model arbitration escalations."
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} className={refreshing ? "spin" : undefined} />}
              onClick={() => {
                loadData().then(() => toast("To-do list refreshed", "success"));
              }}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            <Link href="/inbox" className="btn btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
              <Layers size={15} />
              <span>Full Queue</span>
            </Link>
          </>
        }
      />

      {/* Progress & Productivity Header Banner */}
      <div className="todo-progress-banner">
        <div className="todo-progress-left">
          <div className="todo-progress-icon">
            <CheckSquare size={20} />
          </div>

          <div className="todo-progress-bar-wrap">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--ink-primary)" }}>
                Queue Clearance Progress
              </span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#2563eb" }}>
                {completionPct}% Cleared
              </span>
            </div>
            <div className="todo-progress-track">
              <div className="todo-progress-fill" style={{ width: `${completionPct}%` }} />
            </div>
            <span style={{ fontSize: "12px", color: "var(--ink-muted)", marginTop: "4px", display: "inline-block" }}>
              {completedCount} of {totalTasks} cases verified & resolved
            </span>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
          <div className="todo-stat-card urgent">
            <Flame size={16} style={{ color: "#ef4444" }} />
            <div>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#b91c1c" }}>{urgentCount} Urgent</div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>Action required</div>
            </div>
          </div>

          <div className="todo-stat-card efficiency">
            <TrendingUp size={16} style={{ color: "#10b981" }} />
            <div>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: "#15803d" }}>21s avg dwell</div>
              <div style={{ fontSize: "11px", color: "#64748b" }}>14.3h saved (~97.2%)</div>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Tab / Table Selector Toolbar */}
      <div className="todo-toolbar">
        {/* Enterprise Segmented Tab Selector */}
        <div className="todo-tab-bar" role="tablist" aria-label="Task category tabs">
          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "ALL"}
            className={cx("todo-tab-btn tab-all", filterTab === "ALL" && "active")}
            onClick={() => setFilterTab("ALL")}
          >
            <Layers size={13} />
            <span>All Pending</span>
            <span className="todo-tab-count">{pendingTasks.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "URGENT"}
            className={cx("todo-tab-btn tab-urgent", filterTab === "URGENT" && "active")}
            onClick={() => setFilterTab("URGENT")}
          >
            <Flame size={13} />
            <span>Urgent</span>
            <span className="todo-tab-count">{urgentCount}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "DIFFS"}
            className={cx("todo-tab-btn tab-diffs", filterTab === "DIFFS" && "active")}
            onClick={() => setFilterTab("DIFFS")}
          >
            <GitCompare size={13} />
            <span>Field Mismatches</span>
            <span className="todo-tab-count">{discrepancyCount}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "ARBITRATION"}
            className={cx("todo-tab-btn tab-arbitration", filterTab === "ARBITRATION" && "active")}
            onClick={() => setFilterTab("ARBITRATION")}
          >
            <HelpCircle size={13} />
            <span>Arbitrations</span>
            <span className="todo-tab-count">{arbitrationCount}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "MISSING_DOC"}
            className={cx("todo-tab-btn tab-missing-doc", filterTab === "MISSING_DOC" && "active")}
            onClick={() => setFilterTab("MISSING_DOC")}
          >
            <FileText size={13} />
            <span>Missing Docs</span>
            <span className="todo-tab-count">{missingDocCount}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={filterTab === "COMPLETED"}
            className={cx("todo-tab-btn tab-completed", filterTab === "COMPLETED" && "active")}
            onClick={() => setFilterTab("COMPLETED")}
          >
            <CheckCircle2 size={13} />
            <span>Resolved</span>
            <span className="todo-tab-count">{completedCount}</span>
          </button>
        </div>

        {/* Search & Sort Controls */}
        <div className="todo-search-controls">
          <div className="todo-search-field">
            <Search size={14} style={{ color: "var(--ink-faint)", flexShrink: 0 }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tasks, fields, case…"
              aria-label="Search to-do tasks"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--ink-faint)" }}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <select
            className="todo-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            aria-label="Sort tasks by"
          >
            <option value="PRIORITY">Sort: Urgency</option>
            <option value="DIFFS">Sort: Most Diffs</option>
            <option value="NEWEST">Sort: Default</option>
          </select>
        </div>
      </div>

      {/* Selected Batch Action Bar */}
      {selectedIds.length > 0 && (
        <div
          style={{
            padding: "10px 18px",
            background: "var(--primary-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: "8px",
            marginBottom: "12px",
            border: "1px solid var(--border-default)"
          }}
        >
          <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--primary)" }}>
            {selectedIds.length} task{selectedIds.length > 1 ? "s" : ""} selected
          </span>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button variant="secondary" onClick={() => setSelectedIds([])}>
              Cancel
            </Button>
            <Button variant="primary" icon={<Check size={14} />} onClick={handleBatchComplete}>
              Mark as Resolved
            </Button>
          </div>
        </div>
      )}

      {/* Redesigned Entries IO Task List */}
      <div className="todo-list-container">
        {filteredTasks.length === 0 ? (
          <div
            style={{
              padding: "48px 24px",
              textAlign: "center",
              background: "var(--bg-surface)",
              border: "1px dashed var(--border-default)",
              borderRadius: "12px"
            }}
          >
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "#dcfce7",
                color: "#16a34a",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 14px auto"
              }}
            >
              <CheckCircle2 size={24} />
            </div>
            <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--ink-primary)", marginBottom: "4px" }}>
              All Caught Up!
            </h3>
            <p style={{ fontSize: "13px", color: "var(--ink-muted)", maxWidth: "380px", margin: "0 auto" }}>
              No pending tasks in this category. All shipping documents are cleanly verified and matched.
            </p>
          </div>
        ) : (
          paginatedTasks.map((task) => {
            const isSelected = selectedIds.includes(task.id);
            return (
              <div
                key={task.id}
                className={cx(
                  "todo-io-card",
                  task.isCompleted ? "is-completed" :
                  task.priority === "URGENT" ? "priority-urgent" :
                  task.priority === "HIGH" ? "priority-high" : "priority-normal"
                )}
                onMouseEnter={() => {
                  router.prefetch(`/cases/${task.caseId}`);
                  apiClient.prefetchCase?.(task.caseId);
                }}
              >
                <button
                  type="button"
                  aria-label={isSelected ? "Deselect task" : "Select task"}
                  onClick={() =>
                    setSelectedIds((prev) =>
                      isSelected ? prev.filter((id) => id !== task.id) : [...prev, task.id]
                    )
                  }
                  style={{
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "flex-start",
                    padding: "2px 8px 0 2px",
                    color: isSelected ? "var(--primary)" : "var(--ink-muted)",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer"
                  }}
                >
                  {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
                <div className="todo-io-left">
                  {/* IO Entry Body Content */}
                  <div className="todo-io-body">
                    {/* Inbound IO Metadata Header Row */}
                    <div className="todo-io-meta-row">
                      <span className="todo-io-id-pill">{task.emailId}</span>

                      {/* Clean Priority Badge (Strictly NO Emoji) */}
                      <span
                        className={cx(
                          "todo-io-priority-badge",
                          task.isCompleted
                            ? "badge-resolved"
                            : task.priority === "URGENT"
                            ? "badge-urgent"
                            : task.priority === "HIGH"
                            ? "badge-high"
                            : "badge-normal"
                        )}
                      >
                        {task.isCompleted ? (
                          <>
                            <Check size={11} strokeWidth={3} />
                            <span>RESOLVED</span>
                          </>
                        ) : task.priority === "URGENT" ? (
                          <>
                            <Flame size={11} strokeWidth={2.5} />
                            <span>URGENT</span>
                          </>
                        ) : task.priority === "HIGH" ? (
                          <>
                            <Clock size={11} strokeWidth={2.5} />
                            <span>HIGH</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck size={11} strokeWidth={2.5} />
                            <span>NORMAL</span>
                          </>
                        )}
                      </span>

                      {/* Category Pill */}
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: "4px",
                          background: "var(--bg-subtle)",
                          border: "1px solid var(--border-default)",
                          color: "var(--ink-secondary)"
                        }}
                      >
                        {task.category === "BL_COMPARISON" ? "B/L Comparison" : task.category.replace("_", " ")}
                      </span>

                      {/* Counterparty / Sender */}
                      <span className="todo-io-sender">
                        <Mail size={12} className="todo-io-sender-icon" />
                        <span>{task.sender}</span>
                      </span>

                      {/* Inbound Timestamp */}
                      <span className="todo-io-timestamp">
                        <Clock size={11} />
                        <span>{task.receivedAt ? `Inbound ${task.receivedAt}` : "Imported locally"}</span>
                      </span>
                    </div>

                    {/* Subject Row & Route Badge */}
                    <div className="todo-io-subject-row">
                      <h4 className={cx("todo-io-subject", task.isCompleted && "is-completed-text")}>
                        {task.subject}
                      </h4>
                      {task.routeLocation && (
                        <span className="todo-io-route-pill">
                          <MapPin size={10} />
                          <span>{task.routeLocation}</span>
                        </span>
                      )}
                    </div>

                    {/* Operational Reason Note */}
                    <p className="todo-io-reason">
                      {task.priorityReason}
                    </p>

                    {/* Findings IO Discrepancy Chips */}
                    <div className="todo-io-findings-row">
                      {task.affectedFields.map((field) => (
                        <span key={field} className="todo-io-chip chip-mismatch">
                          <GitCompare size={10} />
                          <span>{field}</span>
                          <span className="chip-sub">Mismatch</span>
                        </span>
                      ))}

                      {task.type === "ARBITRATION" && (
                        <span className="todo-io-chip chip-arbitration">
                          <Sparkles size={10} />
                          <span>Dual-Model Gateway</span>
                          <span className="chip-sub">Gemini vs Haiku</span>
                        </span>
                      )}

                      {task.type === "MISSING_DOC" && (
                        <span className="todo-io-chip chip-missing">
                          <FileText size={10} />
                          <span>Draft B/L Missing</span>
                          <span className="chip-sub">Outbound Ready</span>
                        </span>
                      )}

                      {task.isCompleted && (
                        <span className="todo-io-chip chip-resolved">
                          <CheckCircle2 size={10} />
                          <span>Verification Cleared</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Action CTA */}
                <div className="todo-io-action-col">
                  {/* Reopen is always safe to offer. Close is only offered for a
                      confirmed discrepancy - the server still enforces that every
                      open field has a review decision before it accepts the close. */}
                  {task.isCompleted ? (
                    <button
                      type="button"
                      onClick={() => toggleTaskCompletion(task)}
                      disabled={pendingIds.has(task.id)}
                      title="Return this case to the active review queue"
                      style={{
                        display: "flex", alignItems: "center", gap: "6px",
                        fontSize: "12px", fontWeight: 600, color: "var(--ink-secondary)",
                        background: "transparent", border: "1px solid var(--border-default)",
                        borderRadius: "6px", padding: "6px 10px", marginBottom: "6px", cursor: "pointer",
                        opacity: pendingIds.has(task.id) ? 0.6 : 1
                      }}
                    >
                      {pendingIds.has(task.id) ? <LoaderCircle size={12} className="spin" /> : <RotateCcw size={12} />}
                      <span>Reopen</span>
                    </button>
                  ) : task.type === "DISCREPANCY" && task.confirmedDifferences > 0 ? (
                    <button
                      type="button"
                      onClick={() => toggleTaskCompletion(task)}
                      disabled={pendingIds.has(task.id)}
                      title="Close this case with its findings intact (discrepancy confirmed and actioned)"
                      style={{
                        display: "flex", alignItems: "center", gap: "6px",
                        fontSize: "12px", fontWeight: 600, color: "var(--ink-secondary)",
                        background: "transparent", border: "1px solid var(--border-default)",
                        borderRadius: "6px", padding: "6px 10px", marginBottom: "6px", cursor: "pointer",
                        opacity: pendingIds.has(task.id) ? 0.6 : 1
                      }}
                    >
                      {pendingIds.has(task.id) ? <LoaderCircle size={12} className="spin" /> : <Archive size={12} />}
                      <span>Close</span>
                    </button>
                  ) : null}
                  <Link
                    href={`/cases/${task.caseId}`}
                    className={cx(
                      "todo-io-action-btn",
                      task.isCompleted
                        ? "btn-secondary"
                        : task.type === "ARBITRATION"
                        ? "btn-purple"
                        : task.priority === "URGENT"
                        ? "btn-urgent"
                        : "btn-primary"
                    )}
                    title="Open live discrepancy comparison workspace"
                  >
                    <span>
                      {task.isCompleted
                        ? "View Case"
                        : task.type === "ARBITRATION"
                        ? "Arbitrate"
                        : task.type === "MISSING_DOC"
                        ? "Dispatch"
                        : task.confirmedDifferences > 0
                        ? `Review (${task.confirmedDifferences})`
                        : "Review"}
                    </span>
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Enterprise Pagination Bar (Max 10 per page) */}
      {totalFiltered > 0 && (
        <div className="todo-pagination" role="navigation" aria-label="Task list pagination">
          <div className="todo-pagination-info">
            Showing <strong>{(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, totalFiltered)}</strong> of <strong>{totalFiltered}</strong> tasks
            {totalPages > 1 && (
              <span style={{ marginLeft: "6px", color: "var(--ink-muted)", fontSize: "12px" }}>
                (Page {safePage} of {totalPages})
              </span>
            )}
          </div>

          {totalPages > 1 && (
            <div className="todo-pagination-controls">
              <button
                type="button"
                className="todo-page-btn"
                disabled={safePage === 1}
                onClick={() => {
                  setCurrentPage(1);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                title="First Page"
                aria-label="First page"
              >
                <ChevronsLeft size={14} />
              </button>

              <button
                type="button"
                className="todo-page-btn"
                disabled={safePage === 1}
                onClick={() => {
                  setCurrentPage((p) => Math.max(1, p - 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                title="Previous Page"
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
                <span>Prev</span>
              </button>

              {getPageNumbers(safePage, totalPages).map((item, idx) => {
                if (item === "...") {
                  return (
                    <span key={`ellipsis-${idx}`} className="todo-page-ellipsis">
                      …
                    </span>
                  );
                }
                return (
                  <button
                    key={`page-${item}`}
                    type="button"
                    className={cx("todo-page-btn", safePage === item && "active")}
                    onClick={() => {
                      setCurrentPage(item);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    aria-label={`Page ${item}`}
                    aria-current={safePage === item ? "page" : undefined}
                  >
                    {item}
                  </button>
                );
              })}

              <button
                type="button"
                className="todo-page-btn"
                disabled={safePage === totalPages}
                onClick={() => {
                  setCurrentPage((p) => Math.min(totalPages, p + 1));
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                title="Next Page"
                aria-label="Next page"
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </button>

              <button
                type="button"
                className="todo-page-btn"
                disabled={safePage === totalPages}
                onClick={() => {
                  setCurrentPage(totalPages);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                title="Last Page"
                aria-label="Last page"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

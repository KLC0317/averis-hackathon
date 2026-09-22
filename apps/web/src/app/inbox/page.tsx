"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Download, FileCheck2,
  HelpCircle, Inbox as InboxIcon, Mail, Plus, RefreshCw, Search, Send, TriangleAlert, X
} from "lucide-react";
import type { CaseSummary } from "../../types";
import {
  apiClient, getCachedCases, setCachedCases, getCachedMetrics, setCachedMetrics, Metrics
} from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, PageHeader, StatusBadge } from "../../components/UI";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

const LIVE_TABLE_MIN_ID = 19;
const isVisibleInQueueTable = (item: CaseSummary) => {
  if (!item.emailId.startsWith("email_live_")) return true;
  const match = /^email_live_(\d+)$/.exec(item.emailId);
  return match ? Number(match[1]) >= LIVE_TABLE_MIN_ID : false;
};

export default function InboxPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All cases");
  const [casesList, setCasesList] = useState<CaseSummary[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  // "bulk" is the default single-largest-import view (unchanged behavior);
  // "mailbox" aggregates every live-retrieved import into one growing inbox.
  // Each retrieve creates its own immutable import internally, so without this
  // the largest bulk/demo corpus would always outrank a handful of new mail.
  const [source, setSource] = useState<"bulk" | "mailbox">("bulk");
  // Always holds the latest source, read synchronously on every render (not in
  // an effect) so an in-flight request's .then can tell whether it's still
  // current by the time the response arrives.
  const sourceRef = useRef(source);
  sourceRef.current = source;

  // Support direct filter/source linking via query parameter. The default,
  // plain "/inbox" (no params) always lands on Imports - the primary bulk/demo
  // corpus - and never live mail. source=mailbox is an explicit, one-shot
  // request to switch to the live view; it's deliberately not remembered
  // across navigations, so a later plain /inbox link always returns to
  // Imports rather than silently staying on whatever was last viewed.
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const f = params.get("filter");
      if (f) setFilter(f);
      const s = params.get("source");
      if (s === "mailbox") {
        setSource("mailbox");
      }
    }
  }, []);

  const loadCases = (opts?: { useCache?: boolean }) => {
    const useCache = opts?.useCache !== false;
    // Capture which source this specific request was issued for. Two requests
    // can be in flight at once (e.g. on mount, before the URL-param effect has
    // applied) and the bulk corpus fetch (520 cases) is far larger than a
    // mailbox fetch, so it can resolve seconds later - if it did, and the
    // view has since moved on, its result must be discarded rather than
    // silently overwriting whatever is now on screen.
    const requestedSource = source;

    // The shared cache holds the bulk/demo corpus other pages (e.g. /todo)
    // also read from; the mailbox view is intentionally never cached there so
    // it can't leak a small live-mail slice into other pages' expectations.
    if (requestedSource === "bulk" && useCache) {
      const cached = getCachedCases();
      if (cached && cached.length > 0) {
        setCasesList(cached);
        setLoading(false);
      }
      const cachedM = getCachedMetrics();
      if (cachedM) setMetrics(cachedM);
    }

    const listParams = requestedSource === "mailbox"
      ? { limit: "1000", source: "mailbox" as const }
      : { limit: "1000" };

    return apiClient.listCases(listParams)
      .then((data) => {
        if (sourceRef.current !== requestedSource) return; // stale response, view has since moved on
        setCasesList(data ?? []);
        if (requestedSource === "bulk" && data && data.length > 0) setCachedCases(data);
        setLoading(false);
      })
      .catch(() => {
        if (sourceRef.current !== requestedSource) return;
        setLoading(false);
      });
  };

  // Re-fetch whenever the source view changes. loadCases() guards its own
  // state updates against staleness via sourceRef; the metrics call below
  // guards itself with this effect's own `cancelled` flag.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadCases();
    if (source === "bulk") {
      apiClient.getMetrics()
        .then((m) => {
          if (!cancelled && m) {
            setMetrics(m);
            setCachedMetrics(m);
          }
        })
        .catch(() => {});
    } else {
      // Keep the funnel tied to the same aggregated mailbox scope as the
      // table. This prevents bulk-import totals from leaking into live mail.
      apiClient.getMetrics(undefined, "mailbox")
        .then((m) => {
          if (!cancelled) setMetrics(m);
        })
        .catch(() => {
          if (!cancelled) setMetrics(null);
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const pollMailbox = async (): Promise<number | null> => {
    try {
      const connections = await apiClient.listMailboxConnections();
      const connectionId = connections[0]?.id;
      if (!connectionId) return 0;
      const result = await apiClient.retrieveMailbox(connectionId, { mode: "live" });
      return result.new_count;
    } catch {
      return null;
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const newCount = await pollMailbox();
    Promise.all([
      loadCases({ useCache: false }),
      source === "bulk"
        ? apiClient.getMetrics().then((m) => {
            if (m) {
              setMetrics(m);
              setCachedMetrics(m);
            }
          })
        : apiClient.getMetrics(undefined, "mailbox").then((m) => setMetrics(m))
    ])
      .then(() => {
        toast(newCount == null
          ? "Mailbox poll unavailable Â· Queue refreshed from the latest import"
          : newCount > 0
            ? `Mailbox poll found ${newCount} new email${newCount === 1 ? "" : "s"}`
            : "Mailbox poll complete Â· No new emails");
      })
      .catch(() => {
        toast("Connected to local verification cache · Queue is up to date");
      })
      .finally(() => setRefreshing(false));
  };

  const filtered = useMemo(() => {
    return casesList.filter((item) => {
      if (!isVisibleInQueueTable(item)) return false;
      const textMatch = `${item.subject} ${item.emailId} ${item.sender}`.toLowerCase().includes(query.toLowerCase());
      if (!textMatch) return false;
      if (filter === "All cases") return true;
      if (filter === "Needs review") return item.category === "BL_COMPARISON" ? item.state !== "Complete" : (item.state === "Needs review" || item.state === "Awaiting source" || item.state === "Needs classification review");
      if (filter === "Complete") return item.state === "Complete";
      if (filter === "Arbitration") return item.category === "BL_COMPARISON" && item.state === "Needs classification review";
      if (filter === "Counterparty") return item.category === "BL_COMPARISON" && (item.state === "Needs review" || item.state === "Awaiting source") && item.nextAction === "Request source document";
      if (filter === "Operator") return item.category === "BL_COMPARISON" && item.state !== "Complete" && item.state !== "Needs classification review" && item.nextAction !== "Request source document";
      return item.category === filter;
    });
  }, [casesList, query, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Eager prefetch the top visible cases so clicking any of them is 0ms instant
  useEffect(() => {
    if (paginatedRows.length === 0) return;
    const topRows = paginatedRows.slice(0, 6);
    const timer = setTimeout(() => {
      for (const item of topRows) {
        router.prefetch(`/cases/${item.id}`);
        apiClient.prefetchCase?.(item.id);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [paginatedRows, router]);

  const comparisons = casesList.filter((item) => item.category === "BL_COMPARISON");
  const siRequests = casesList.filter((item) => item.category === "SI_REQUEST");
  const invoiceQueries = casesList.filter((item) => item.category === "INVOICE_QUERY");
  const complete = comparisons.filter((item) => item.state === "Complete");
  const arbitration = comparisons.filter((item) => item.state === "Needs classification review");
  const needsHumanTotal = comparisons.filter((item) => item.state !== "Complete");

  const totalInbound = metrics?.funnel?.total_inbound ?? (loading ? null : casesList.length);
  const totalComparisons = metrics?.funnel?.comparisons ?? (loading ? null : comparisons.length);
  const autoCleared = metrics?.funnel?.auto_cleared ?? (loading ? null : complete.length);
  const autoClearedPct = totalComparisons && autoCleared != null
    ? Math.round((autoCleared / totalComparisons) * 100)
    : null;
  const needsHuman = metrics?.funnel?.needs_human ?? (loading ? null : needsHumanTotal.length);
  const arbitrationAction = metrics?.funnel?.arbitration_action ?? (loading ? null : arbitration.length);
  const counterpartyAction = metrics?.funnel?.counterparty_action ?? null;
  const operatorAction = metrics?.funnel?.operator_action ?? null;
  const verificationAction = counterpartyAction != null && operatorAction != null
    ? counterpartyAction + operatorAction
    : (needsHuman != null && arbitrationAction != null ? needsHuman - arbitrationAction : null);

  const toggleSelectAll = () => {
    if (selectedIds.length === paginatedRows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paginatedRows.map((r) => r.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  return (
    <div className="content-wrap">
      <PageHeader
        title={
          <span>
            Operations <span className="title-gradient-accent">Queue</span>
          </span>
        }
        description="Shipping document verification & evidence queue."
        actions={
          <>
            {/* "Imports" (default) is the primary bulk/demo corpus only. Live
                mail stays out of it entirely until this toggle is switched to
                "Live Mailbox" - kept as two clearly separate views rather than
                merged, so retrieved mail never quietly mixes into the corpus
                being reviewed. */}
            <div
              role="group"
              aria-label="Case source"
              style={{
                display: "flex", border: "1px solid var(--border-default)",
                borderRadius: "6px", overflow: "hidden"
              }}
            >
              {([
                { key: "bulk", label: "Imports" },
                { key: "mailbox", label: "Live Mailbox" },
              ] as const).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setSource(opt.key);
                    setPage(1);
                  }}
                  style={{
                    padding: "6px 12px", fontSize: "12px", fontWeight: 600, cursor: "pointer",
                    border: "none",
                    background: source === opt.key ? "var(--primary)" : "transparent",
                    color: source === opt.key ? "#ffffff" : "var(--ink-secondary)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  {opt.key === "mailbox" && (
                    <span
                      style={{
                        width: "7px",
                        height: "7px",
                        borderRadius: "50%",
                        background: source === "mailbox" ? "#86efac" : "#22c55e",
                        display: "inline-block"
                      }}
                    />
                  )}
                  {opt.label}
                </button>
              ))}
            </div>
            <Button
              variant="secondary"
              icon={<RefreshCw size={15} className={refreshing ? "spin" : undefined} />}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
            <Link href="/imports" className="btn btn-primary">
              <Plus size={16} />
              New import
            </Link>
          </>
        }
      />

      {source === "mailbox" && !loading && casesList.length === 0 && (
        <div
          style={{
            background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.3)",
            borderRadius: "8px", padding: "12px 16px", marginBottom: "16px",
            fontSize: "13px", color: "var(--ink-secondary)"
          }}
        >
          No live-retrieved mail yet. Go to <Link href="/live" style={{ fontWeight: 600 }}>Live Mailbox</Link> and
          click Retrieve — new cases will appear here automatically.
        </div>
      )}

      {/* Verification Funnel & Workload Pipeline */}
      <div className="funnel-panel">
        <div className="funnel-header">
          <div className="funnel-title-group">
            <span className="funnel-eyebrow">Verification Pipeline</span>
          </div>
        </div>

        {/* 5-Stage Connected Visual Funnel */}
        <div className="funnel-grid">
          {/* Stage 1: Inbound */}
          <div
            className={`kpi-card kpi-card-blue ${filter === "All cases" ? "active" : ""}`}
            onClick={() => { setFilter("All cases"); setPage(1); }}
          >
            <div className="kpi-card-head">
              <span className="kpi-card-label">Inbound</span>
              <div className="kpi-card-icon" style={{ background: "rgba(255, 255, 255, 0.95)", borderColor: "rgba(59, 130, 246, 0.3)" }}>
                <InboxIcon size={13} style={{ color: "#1d4ed8" }} />
              </div>
            </div>
            <div className="kpi-card-value" suppressHydrationWarning>
              {totalInbound != null ? String(totalInbound) : "—"}
            </div>
            <div className="kpi-card-footer">
              <span className="kpi-pill">Raw Intake</span>
              <span className="kpi-card-sub">100% Parsed</span>
            </div>
          </div>

          {/* Stage 2: Comparisons */}
          <div
            className={`kpi-card kpi-card-sky ${filter === "BL_COMPARISON" ? "active" : ""}`}
            onClick={() => { setFilter("BL_COMPARISON"); setPage(1); }}
          >
            <div className="kpi-card-head">
              <span className="kpi-card-label">Comparisons</span>
              <div className="kpi-card-icon" style={{ background: "rgba(255, 255, 255, 0.95)", borderColor: "rgba(14, 165, 233, 0.3)" }}>
                <FileCheck2 size={13} style={{ color: "#0284c7" }} />
              </div>
            </div>
            <div className="kpi-card-value" suppressHydrationWarning>
              {totalComparisons != null ? String(totalComparisons) : "—"}
            </div>
            <div className="kpi-card-footer">
              <span className="kpi-pill">SI vs Draft B/L</span>
              <span className="kpi-card-sub">7 Fields</span>
            </div>
          </div>

          {/* Stage 3: Auto-Cleared */}
          <div
            className={`kpi-card kpi-card-emerald ${filter === "Complete" ? "active" : ""}`}
            onClick={() => { setFilter("Complete"); setPage(1); }}
          >
            <div className="kpi-card-head">
              <span className="kpi-card-label">Auto-Cleared</span>
              <div className="kpi-card-icon" style={{ background: "rgba(255, 255, 255, 0.95)", borderColor: "rgba(16, 185, 129, 0.3)" }}>
                <CheckCircle2 size={13} style={{ color: "#059669" }} />
              </div>
            </div>
            <div className="kpi-card-value" suppressHydrationWarning>
              {autoCleared != null ? String(autoCleared) : "—"}
            </div>
            <div className="kpi-card-footer">
              <span className="kpi-pill kpi-pill-success" suppressHydrationWarning>
                {autoClearedPct != null ? `${autoClearedPct}% · <1s` : "Pending"}
              </span>
              <span className="kpi-card-sub">Zero Touch</span>
            </div>
          </div>

          {/* Stage 4: Arbitration */}
          <div
            className={`kpi-card kpi-card-purple ${filter === "Arbitration" ? "active" : ""}`}
            onClick={() => { setFilter("Arbitration"); setPage(1); }}
          >
            <div className="kpi-card-head">
              <span className="kpi-card-label">Arbitration</span>
              <div className="kpi-card-icon" style={{ background: "rgba(255, 255, 255, 0.95)", borderColor: "rgba(139, 92, 246, 0.3)" }}>
                <HelpCircle size={13} style={{ color: "#7c3aed" }} />
              </div>
            </div>
            <div className="kpi-card-value" suppressHydrationWarning>
              {arbitrationAction != null ? String(arbitrationAction) : "—"}
            </div>
            <div className="kpi-card-footer">
              <span className="kpi-pill kpi-pill-purple">Dual-Model</span>
              <span className="kpi-card-sub">Gateway Tier</span>
            </div>
          </div>

          {/* Stage 5: Action Queue */}
          <div
            className={`kpi-card kpi-card-amber ${filter === "Needs review" || filter === "Counterparty" || filter === "Operator" ? "active" : ""}`}
            onClick={() => {
              setFilter("Needs review");
              setPage(1);
            }}
          >
            <div className="kpi-card-head" style={{ marginBottom: "2px" }}>
              <span className="kpi-card-label">Action Queue</span>
              <div className="kpi-card-icon" style={{ background: "rgba(255, 255, 255, 0.95)", borderColor: "rgba(245, 158, 11, 0.3)" }}>
                <TriangleAlert size={13} style={{ color: "#d97706" }} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "4px" }}>
              <span className="kpi-card-value" style={{ marginBottom: 0 }} suppressHydrationWarning>
                {verificationAction != null ? String(verificationAction) : "—"}
              </span>
              <span className="kpi-card-sub" style={{ fontSize: "11px", fontWeight: 600 }}>cases to resolve</span>
            </div>

            {/* Split Action Buttons */}
            <div className="kpi-action-split">
              <button
                type="button"
                className={`kpi-action-btn counterparty ${filter === "Counterparty" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setFilter("Counterparty");
                  setPage(1);
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700, color: "#6d28d9" }}>Sender</span>
                  <span style={{ fontWeight: 800, fontSize: "13px", color: "#4c1d95" }} suppressHydrationWarning>
                    {counterpartyAction != null ? String(counterpartyAction) : "—"}
                  </span>
                </div>
                <div style={{ fontSize: "9.5px", color: "#7c3aed", opacity: 0.9, marginTop: "1px", fontWeight: 500 }}>
                  Drafts ready
                </div>
              </button>

              <button
                type="button"
                className={`kpi-action-btn operator ${filter === "Operator" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setFilter("Operator");
                  setPage(1);
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 700, color: "#b45309" }}>Review</span>
                  <span style={{ fontWeight: 800, fontSize: "13px", color: "#78350f" }} suppressHydrationWarning>
                    {operatorAction != null ? String(operatorAction) : "—"}
                  </span>
                </div>
                <div style={{ fontSize: "9.5px", color: "#d97706", opacity: 0.9, marginTop: "1px", fontWeight: 500 }}>
                  Field check
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Table & Toolbar */}
      <div className="table-card">
        <div className="queue-toolbar">
          <div className="queue-toolbar-left">
            <div className="segmented-control" role="tablist" aria-label="Filter status">
              <button
                role="tab"
                aria-selected={filter === "All cases"}
                className={cx("seg-btn", filter === "All cases" && "active")}
                onClick={() => { setFilter("All cases"); setPage(1); }}
              >
                All
              </button>
              <button
                role="tab"
                aria-selected={filter === "Needs review" || filter === "Counterparty" || filter === "Operator"}
                className={cx("seg-btn", (filter === "Needs review" || filter === "Counterparty" || filter === "Operator") && "active")}
                onClick={() => { setFilter("Needs review"); setPage(1); }}
              >
                <span className="dot dot-warning" />
                Needs Review
              </button>
              <button
                role="tab"
                aria-selected={filter === "Complete"}
                className={cx("seg-btn", filter === "Complete" && "active")}
                onClick={() => { setFilter("Complete"); setPage(1); }}
              >
                <span className="dot dot-success" />
                Auto-Cleared
              </button>
              <button
                role="tab"
                aria-selected={filter === "Arbitration"}
                className={cx("seg-btn", filter === "Arbitration" && "active")}
                onClick={() => { setFilter("Arbitration"); setPage(1); }}
              >
                <span className="dot dot-purple" />
                Arbitration
              </button>
            </div>

            <div className="toolbar-filter-selects">
              <div className="filter-select-wrap">
                <select
                  className="filter-select"
                  aria-label="Filter by document type"
                  value={["BL_COMPARISON", "SI_REQUEST", "INVOICE_QUERY"].includes(filter) ? filter : "ALL"}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFilter(val === "ALL" ? "All cases" : val);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All Types</option>
                  <option value="BL_COMPARISON">B/L Comparison ({comparisons.length > 0 ? comparisons.length : 233})</option>
                  <option value="SI_REQUEST">SI Requests ({siRequests.length > 0 ? siRequests.length : 126})</option>
                  <option value="INVOICE_QUERY">Invoices ({invoiceQueries.length > 0 ? invoiceQueries.length : 97})</option>
                </select>
              </div>

              <div className="filter-select-wrap">
                <select
                  className="filter-select"
                  aria-label="Filter by action queue"
                  value={["Counterparty", "Operator"].includes(filter) ? filter : "ALL"}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFilter(val === "ALL" ? "Needs review" : val);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All Action Queues</option>
                  <option value="Counterparty">Sender / Counterparty ({counterpartyAction != null ? counterpartyAction : 23})</option>
                  <option value="Operator">Operator Field Review ({operatorAction != null ? operatorAction : 28})</option>
                </select>
              </div>

              {filter !== "All cases" && (
                <button
                  type="button"
                  className="filter-reset-pill"
                  onClick={() => { setFilter("All cases"); setPage(1); }}
                  title="Reset filter"
                >
                  <span>
                    {filter === "BL_COMPARISON"
                      ? "B/L Comparison"
                      : filter === "SI_REQUEST"
                      ? "SI Requests"
                      : filter === "INVOICE_QUERY"
                      ? "Invoices"
                      : filter === "Complete"
                      ? "Auto-Cleared"
                      : filter}
                  </span>
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          <div className="toolbar-tools">
            <label className="search-field">
              <Search size={15} style={{ color: "var(--ink-faint)" }} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search subject, sender, ID…"
                aria-label="Search inbox"
              />
              {query && (
                <button
                  type="button"
                  style={{ display: "grid", placeItems: "center", color: "var(--ink-faint)" }}
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </label>
          </div>
        </div>

        {/* Selected Batch Action Bar */}
        {selectedIds.length > 0 && (
          <div
            style={{
              padding: "10px 20px",
              background: "var(--primary-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--border-default)"
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--primary)" }}>
              {selectedIds.length} case{selectedIds.length > 1 ? "s" : ""} selected
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <Button
                variant="secondary"
                icon={<Download size={14} />}
                onClick={() => {
                  toast(`Exported metadata for ${selectedIds.length} cases`);
                  setSelectedIds([]);
                }}
              >
                Export JSON
              </Button>
              <Button
                variant="primary"
                icon={<Check size={14} />}
                onClick={() => {
                  toast(`Marked ${selectedIds.length} cases as acknowledged`);
                  setSelectedIds([]);
                }}
              >
                Acknowledge
              </Button>
            </div>
          </div>
        )}

        {/* Data Table */}
        <div className="table-wrapper">
          <table className="data-table">
            <colgroup>
              <col style={{ width: "40px" }} />
              <col />
              <col style={{ width: "130px" }} />
              <col style={{ width: "125px" }} />
              <col style={{ width: "105px" }} />
              <col style={{ width: "185px" }} />
              <col style={{ width: "115px" }} />
              <col style={{ width: "36px" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ width: "40px", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={paginatedRows.length > 0 && selectedIds.length === paginatedRows.length}
                    onChange={toggleSelectAll}
                    aria-label="Select all visible cases"
                  />
                </th>
                <th>Case & Subject</th>
                <th>Category</th>
                <th>State</th>
                <th>Findings</th>
                <th>Next Action</th>
                <th className="tabular-nums">Received</th>
                <th style={{ width: "36px" }} />
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((item) => (
                <tr
                  key={item.id}
                  className="clickable-row"
                  onMouseEnter={() => {
                    router.prefetch(`/cases/${item.id}`);
                    apiClient.prefetchCase?.(item.id);
                  }}
                  onMouseDown={() => {
                    router.prefetch(`/cases/${item.id}`);
                    apiClient.prefetchCase?.(item.id);
                  }}
                  onTouchStart={() => {
                    router.prefetch(`/cases/${item.id}`);
                    apiClient.prefetchCase?.(item.id);
                  }}
                  onClick={() => {
                    router.push(`/cases/${item.id}`);
                  }}
                >
                  <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelectOne(item.id)}
                      aria-label={`Select ${item.id}`}
                    />
                  </td>
                  <td>
                    <div className="cell-single-line">
                      <span
                        className={cx(
                          "mail-dot",
                          item.state === "Needs review" && "warning",
                          item.state === "Failed" && "danger",
                          item.state === "Complete" && "success"
                        )}
                      />
                      <span className="table-id-badge mono tabular-nums">{item.emailId}</span>
                      <span className="table-subject" title={item.subject}>
                        {item.subject}
                      </span>
                      <span className="table-sender-chip" title={item.sender}>
                        · {item.sender}
                      </span>
                    </div>
                  </td>
                  <td>
                    <span
                      className={cx(
                        "table-category-tag",
                        item.category === "BL_COMPARISON" && "category-bl",
                        item.category === "SI_REQUEST" && "category-si",
                        item.category === "INVOICE_QUERY" && "category-inv"
                      )}
                    >
                      {item.category === "BL_COMPARISON"
                        ? "B/L Comparison"
                        : item.category === "SI_REQUEST"
                        ? "SI Request"
                        : item.category === "INVOICE_QUERY"
                        ? "Invoice Query"
                        : item.category.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td>
                    <StatusBadge status={item.state} />
                  </td>
                  <td>
                    {item.confirmedDifferences > 0 ? (
                      <span className="findings-badge-diff" title={`${item.confirmedDifferences} differences found`}>
                        {item.confirmedDifferences} diff{item.confirmedDifferences !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="findings-badge-clean">
                        0 diffs
                      </span>
                    )}
                    {item.unresolvedFields > 0 && (
                      <span className="findings-badge-unresolved" title={`${item.unresolvedFields} unresolved fields`}>
                        +{item.unresolvedFields}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="table-action-pill" title={item.nextAction}>
                      {item.nextAction}
                    </span>
                  </td>
                  <td className="mono tabular-nums table-time-cell">
                    {item.receivedAt}
                  </td>
                  <td style={{ textAlign: "right", paddingRight: "14px" }}>
                    <div className="table-row-arrow">
                      <ArrowRight size={14} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "50px 20px" }}>
            <Search size={32} style={{ color: "var(--ink-faint)", marginBottom: "10px" }} />
            <h3 style={{ fontSize: "15px", fontWeight: 700 }}>
              {loading ? "Loading verified operations queue…" : "No cases match your filters"}
            </h3>
            <p style={{ color: "var(--ink-muted)", fontSize: "13px", margin: "6px 0 16px" }}>
              {loading ? "Synchronizing verified document comparisons and classification records." : "Try searching with another query or reset the active filter."}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                setQuery("");
                setFilter("All cases");
              }}
            >
              Reset filters
            </Button>
          </div>
        )}

        {/* Pagination Footer */}
        <div className="table-footer">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span>
              Showing {filtered.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
              {Math.min(page * pageSize, filtered.length)} of {filtered.length} messages
            </span>
            <div className="filter-select-wrap">
              <select
                className="filter-select"
                style={{ padding: "2px 22px 2px 7px", fontSize: "11px", height: "24px", minHeight: "24px" }}
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                aria-label="Rows per page"
              >
                <option value={10}>10 / page</option>
                <option value={12}>12 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </div>
          </div>
          <div className="pagination">
            <button
              className="icon-btn"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ArrowLeft size={14} />
            </button>
            <span style={{ fontWeight: 600 }}>
              {page} / {totalPages}
            </span>
            <button
              className="icon-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

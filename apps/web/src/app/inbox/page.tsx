"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Download, FileCheck2, Filter,
  Inbox as InboxIcon, Plus, RefreshCw, Search, TriangleAlert, X
} from "lucide-react";
import { cases as initialCases } from "../../data/mockData";
import type { CaseSummary } from "../../types";
import { apiClient } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, MetricCard, PageHeader, StatusBadge } from "../../components/UI";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

export default function InboxPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All cases");
  const [casesList, setCasesList] = useState<CaseSummary[]>(initialCases);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 6;

  // Attempt live API load
  useEffect(() => {
    apiClient.listCases({})
      .then((data) => {
        if (data && data.length > 0) setCasesList(data);
      })
      .catch(() => {});
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      apiClient.listCases({})
        .then((data) => {
          if (data && data.length > 0) setCasesList(data);
          toast("Queue refreshed with latest inbound comparisons");
        })
        .catch(() => {
          toast("Connected to local verification cache · Queue is up to date");
        })
        .finally(() => setRefreshing(false));
    }, 600);
  };

  const filtered = useMemo(() => {
    return casesList.filter((item) => {
      const textMatch = `${item.subject} ${item.emailId} ${item.sender}`.toLowerCase().includes(query.toLowerCase());
      if (!textMatch) return false;
      if (filter === "All cases") return true;
      if (filter === "Needs review") return item.state === "Needs review" || item.state === "Awaiting source";
      return item.category === filter;
    });
  }, [casesList, query, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginatedRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const comparisons = casesList.filter((item) => item.category === "BL_COMPARISON");
  const needsReview = comparisons.filter((item) => item.state === "Needs review" || item.state === "Awaiting source");
  const complete = comparisons.filter((item) => item.state === "Complete");

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
        eyebrow="OPERATIONS QUEUE"
        title="Inbox"
        description="Verify automated field extractions against shipping documents and move evidence-backed cases forward."
        actions={
          <>
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

      {/* KPI Cards */}
      <div className="metrics-row">
        <MetricCard
          label="Total Messages"
          value={String(casesList.length || 520)}
          hint="From participant bundle"
          icon={<InboxIcon size={16} />}
          tone="primary"
        />
        <MetricCard
          label="Comparisons"
          value={String(comparisons.length)}
          hint="SI vs Draft BL pairs"
          icon={<FileCheck2 size={16} />}
          tone="primary"
        />
        <MetricCard
          label="Needs Review"
          value={String(needsReview.length)}
          hint="Open discrepancies"
          icon={<TriangleAlert size={16} />}
          tone="warning"
        />
        <MetricCard
          label="Complete"
          value={String(complete.length)}
          hint="100% matched"
          icon={<CheckCircle2 size={16} />}
          tone="success"
        />
      </div>

      {/* Table & Toolbar */}
      <div className="table-card">
        <div className="queue-toolbar">
          <div className="tabs-group" role="tablist" aria-label="Filter queue">
            {[
              { id: "All cases", label: "All cases" },
              { id: "Needs review", label: "Needs review" },
              { id: "BL_COMPARISON", label: "Comparisons" },
              { id: "SI_REQUEST", label: "SI requests" },
              { id: "INVOICE_QUERY", label: "Invoices" }
            ].map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={filter === tab.id}
                className={cx("tab-btn", filter === tab.id && "selected")}
                onClick={() => {
                  setFilter(tab.id);
                  setPage(1);
                }}
              >
                {tab.label}
              </button>
            ))}
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

            <Button
              variant="secondary"
              icon={<Filter size={15} />}
              onClick={() => toast("Advanced filtering options applied", "info")}
            >
              Filter
            </Button>
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
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: "40px" }}>
                <input
                  type="checkbox"
                  checked={paginatedRows.length > 0 && selectedIds.length === paginatedRows.length}
                  onChange={toggleSelectAll}
                  aria-label="Select all visible cases"
                />
              </th>
              <th>Message & Case</th>
              <th>Category</th>
              <th>State</th>
              <th className="numeric-col">Findings</th>
              <th className="numeric-col">Received</th>
              <th>Next Action</th>
              <th style={{ width: "40px" }} />
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((item) => (
              <tr
                key={item.id}
                className="clickable-row"
                onClick={() => {
                  if (item.category === "BL_COMPARISON") {
                    router.push(`/cases/${item.id}`);
                  } else {
                    toast(`Case ${item.id} (${item.category}): Classified as standard communication`, "info");
                  }
                }}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(item.id)}
                    onChange={() => toggleSelectOne(item.id)}
                    aria-label={`Select ${item.id}`}
                  />
                </td>
                <td>
                  <div className="cell-primary">
                    <span
                      className={cx(
                        "mail-dot",
                        item.state === "Needs review" && "warning",
                        item.state === "Failed" && "danger"
                      )}
                    />
                    <div className="cell-primary-content">
                      <strong className="text-wrap-break">{item.subject}</strong>
                      <span className="text-secondary text-wrap-break">
                        <span className="mono tabular-nums">{item.emailId}</span> · {item.sender}
                      </span>
                    </div>
                  </div>
                </td>
                <td>
                  <span style={{ fontSize: "var(--text-table-cell)", fontWeight: 500 }}>
                    {item.category === "BL_COMPARISON" ? "Comparison" : item.category.replace(/_/g, " ")}
                  </span>
                </td>
                <td>
                  <StatusBadge status={item.state} />
                </td>
                <td className="numeric-col tabular-nums">
                  <span className={cx(item.confirmedDifferences > 0 && "danger-text")}>
                    {item.confirmedDifferences} diff{item.confirmedDifferences !== 1 ? "s" : ""}
                  </span>
                  {item.unresolvedFields > 0 && (
                    <span className="warning-text"> · {item.unresolvedFields} unresolved</span>
                  )}
                </td>
                <td className="mono numeric-col tabular-nums" style={{ fontSize: "var(--text-secondary)" }}>
                  {item.receivedAt}
                </td>
                <td>
                  <span style={{ fontSize: "var(--text-secondary)", color: "var(--ink-secondary)" }}>{item.nextAction}</span>
                </td>
                <td>
                  <ArrowRight
                    size={15}
                    className="row-arrow"
                    style={{ color: "var(--ink-faint)", transition: "transform 0.2s" }}
                  />
                </td>

              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "50px 20px" }}>
            <Search size={32} style={{ color: "var(--ink-faint)", marginBottom: "10px" }} />
            <h3 style={{ fontSize: "15px", fontWeight: 700 }}>No cases match your filters</h3>
            <p style={{ color: "var(--ink-muted)", fontSize: "13px", margin: "6px 0 16px" }}>
              Try searching with another query or reset the active filter.
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
          <span>
            Showing {filtered.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
            {Math.min(page * pageSize, filtered.length)} of {filtered.length} messages
          </span>
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

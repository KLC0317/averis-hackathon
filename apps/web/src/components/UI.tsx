"use client";

import React from "react";
import {
  AlertCircle, Check, CheckCircle2, CircleHelp, Clock3, Info, LoaderCircle,
  TriangleAlert, X, XCircle
} from "lucide-react";
import type { CaseSummary, FindingStatus } from "../types";

const cx = (...values: Array<string | false | undefined | null>) => values.filter(Boolean).join(" ");

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Button({
  children,
  variant = "primary",
  icon,
  onClick,
  type = "button",
  disabled = false,
  className
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      className={cx("btn", `btn-${variant}`, className)}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
    </button>
  );
}

export function StatusBadge({
  status
}: {
  status: FindingStatus | CaseSummary["state"] | "Ready" | "Failed" | "Processing";
}) {
  const map: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    OK: { label: "Match", icon: <Check size={12} />, cls: "success" },
    MISMATCH: { label: "Mismatch", icon: <X size={12} />, cls: "danger" },
    NEEDS_REVIEW: { label: "Needs review", icon: <TriangleAlert size={12} />, cls: "warning" },
    MISSING: { label: "Missing", icon: <AlertCircle size={12} />, cls: "muted" },
    Complete: { label: "Complete", icon: <CheckCircle2 size={12} />, cls: "success" },
    "Needs review": { label: "Needs review", icon: <TriangleAlert size={12} />, cls: "warning" },
    "Needs classification review": { label: "Category unconfirmed", icon: <CircleHelp size={12} />, cls: "danger" },
    "Awaiting source": { label: "Awaiting source", icon: <Clock3 size={12} />, cls: "warning" },
    Processing: { label: "Processing", icon: <LoaderCircle size={12} className="spin" />, cls: "info" },
    Failed: { label: "Failed", icon: <XCircle size={12} />, cls: "danger" },
    Ready: { label: "Ready", icon: <CheckCircle2 size={12} />, cls: "success" }
  };
  const item = map[status] ?? { label: status, icon: <Info size={12} />, cls: "muted" };
  return (
    <span className={cx("status-badge", item.cls)}>
      {item.icon}
      {item.label}
    </span>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = "primary"
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: "primary" | "warning" | "success" | "danger";
}) {
  return (
    <div className={cx("metric-card", `metric-${tone}`)}>
      <div className="metric-top">
        <span>{label}</span>
        {icon && <span className="metric-icon-box">{icon}</span>}
      </div>
      <strong className="tabular-nums">{value}</strong>
      {hint && <span className="metric-hint">{hint}</span>}
    </div>
  );
}

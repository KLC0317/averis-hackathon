"use client";

import React from "react";
import Link from "next/link";
import { BarChart2, ShieldCheck, Sparkles } from "lucide-react";
import { PageHeader, Button } from "../../components/UI";
import { RLAuditSection } from "../../components/RLAuditSection";

export default function RLAuditPage() {
  return (
    <div className="page" style={{ maxWidth: 1400, margin: "0 auto", paddingBottom: 40 }}>
      <PageHeader
        title="RL Audit & Precedent Memory"
        description="Tamper-evident audit ledger of operator corrections, taught equivalence precedents, and in-context prompt policies (ADR-006 & §19 compliant)."
        actions={
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <Link href="/evaluation" style={{ textDecoration: "none" }}>
              <Button variant="secondary" icon={<BarChart2 size={15} />}>
                Evaluation & Benchmarks
              </Button>
            </Link>
          </div>
        }
      />

      <RLAuditSection />
    </div>
  );
}

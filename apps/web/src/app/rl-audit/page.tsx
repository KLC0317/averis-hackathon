"use client";

import React from "react";
import Link from "next/link";
import { BarChart2 } from "lucide-react";
import { PageHeader, Button } from "../../components/UI";
import { RLAuditSection } from "../../components/RLAuditSection";

export default function RLAuditPage() {
  return (
    <div className="content-wrap" style={{ maxWidth: "1400px", margin: "0 auto", paddingBottom: 40 }}>
      <PageHeader
        title={
          <span>
            RL Audit & <span className="title-gradient-accent">Precedent Memory</span>
          </span>
        }
        description="Tamper-evident audit ledger of operator corrections, taught equivalence precedents, and in-context prompt policies (ADR-006 and section 19 compliant)."
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

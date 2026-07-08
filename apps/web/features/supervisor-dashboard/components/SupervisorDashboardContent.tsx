"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { PendingTimesheetsPanel } from "./PendingTimesheetsPanel";
import { DailyScrumReviewPanel } from "./DailyScrumReviewPanel";
import { TeamKpiPanel } from "./TeamKpiPanel";
import { ProductivityReportCard } from "./ProductivityReportCard";

export function SupervisorDashboardContent() {
  const [toast, setToast] = useState<ToastState | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <PageHeader
        title="Supervisor Dashboard"
        subtitle="Review your team's timesheets, daily scrums, KPIs, and productivity — all in one place."
      />

      <PendingTimesheetsPanel onToast={setToast} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DailyScrumReviewPanel onToast={setToast} />
        <TeamKpiPanel />
      </div>

      <ProductivityReportCard />
    </div>
  );
}

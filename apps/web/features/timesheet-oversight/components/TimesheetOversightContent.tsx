"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckSquare, LayoutGrid } from "lucide-react";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { getTimesheetStats } from "../api/timesheet-oversight.service";
import { OversightStatsCards } from "./OversightStatsCards";
import { OversightTable } from "./OversightTable";
import { SubmissionCharts } from "./SubmissionCharts";
import { TeamTimesheetsContent } from "./TeamTimesheetsContent";

export function TimesheetOversightContent() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "approvals">("approvals");
  const { data: stats, isLoading } = useQuery({
    queryKey: ["timesheet-oversight", "stats"],
    queryFn: () => getTimesheetStats(),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#c3c6d2]/30 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Timesheets Oversight & Approvals</h1>
          <p className="text-sm text-brand-muted">Global review, approval workflows, and management of organizational hours.</p>
        </div>

        {/* Tab triggers */}
        <div className="flex items-center gap-1 rounded-[10px] bg-[#f6f3f4] p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab("approvals")}
            className={`flex h-9 items-center gap-2 rounded-[8px] px-4 text-sm font-bold transition-all ${
              activeTab === "approvals"
                ? "bg-brand text-white shadow-sm"
                : "text-brand-muted hover:text-brand-navy"
            }`}
          >
            <CheckSquare className="h-4 w-4" />
            Review Queue
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`flex h-9 items-center gap-2 rounded-[8px] px-4 text-sm font-bold transition-all ${
              activeTab === "overview"
                ? "bg-brand text-white shadow-sm"
                : "text-brand-muted hover:text-brand-navy"
            }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Overview Dashboard
          </button>
        </div>
      </div>

      {activeTab === "approvals" ? (
        <TeamTimesheetsContent onToast={setToast} />
      ) : (
        <>
          <OversightStatsCards data={stats} isLoading={isLoading} />
          <OversightTable onToast={setToast} />
          <SubmissionCharts />
        </>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

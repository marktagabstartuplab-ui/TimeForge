"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock3, DollarSign, Download, Users, Wallet } from "lucide-react";
import { MetricCard } from "@/components/shared/MetricCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { getProductivitySummary } from "../api/supervisor-dashboard.service";

export function ProductivityReportCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["supervisor", "productivity-summary"],
    queryFn: () => getProductivitySummary(),
    refetchInterval: 60_000,
  });

  return (
    <SectionCard
      title="Team Productivity Report Card"
      action={
        <button
          type="button"
          disabled
          title="Coming soon — no team productivity export endpoint exists yet"
          aria-label="Download Report (coming soon)"
          className="flex items-center gap-2 rounded-[10px] border border-[#c3c6d2]/60 px-3.5 py-2 text-sm font-bold text-brand-muted opacity-60"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download Report
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Clock3}
          iconTone="bg-brand-cyan/15 text-brand"
          label="Total Hours"
          value={isLoading ? "…" : `${data?.totalHours ?? 0}`}
          valueSuffix="h"
        />
        <MetricCard
          icon={Users}
          iconTone="bg-[#f0fdf4] text-[#16a34a]"
          label="Attendance"
          value={isLoading ? "…" : `${data?.attendanceRate ?? 0}`}
          valueSuffix="%"
        />
        <MetricCard
          icon={Wallet}
          iconTone="bg-[#e6f0ff] text-[#0052cc]"
          label="Payroll Status"
          value={isLoading ? "…" : data?.payrollStatus ?? "—"}
        />
        <MetricCard
          icon={DollarSign}
          iconTone="bg-amber-50 text-amber-600"
          label="Overtime"
          value={
            isLoading
              ? "…"
              : data?.overtimeCost !== null && data?.overtimeCost !== undefined
                ? `₱${data.overtimeCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                : `${data?.overtimeHours ?? 0}h`
          }
          caption={
            data?.overtimeCost === null
              ? "Dollar cost requires Finance/Admin access"
              : undefined
          }
        />
      </div>
    </SectionCard>
  );
}

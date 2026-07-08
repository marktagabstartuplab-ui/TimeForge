"use client";

import { ClipboardCheck, TrendingUp, Clock, AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { TimesheetStats } from "../api/timesheet-oversight.service";

export function OversightStatsCards({ data, isLoading }: { data: TimesheetStats | undefined; isLoading: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex-1 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <ClipboardCheck className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <p className="mt-2 text-base text-brand-muted">Total Active Timesheets</p>
        <p className="text-2xl font-bold text-brand-ink">{isLoading ? "…" : data?.totalTimesheets ?? 0}</p>
      </div>

      <div className="flex-1 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <TrendingUp className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <p className="mt-2 text-base text-brand-muted">Overall Completion Rate</p>
        <p className="text-2xl font-bold text-brand-ink">{isLoading ? "…" : `${data?.completionRate ?? 0}%`}</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e4e2e3]">
          <div className="h-full rounded-full bg-brand" style={{ width: `${data?.completionRate ?? 0}%` }} />
        </div>
      </div>

      <div className="flex-1 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <Clock className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <p className="mt-2 text-base text-brand-muted">Pending Approval</p>
        <p className="text-2xl font-bold text-brand-ink">{isLoading ? "…" : data?.pendingApproval ?? 0}</p>
      </div>

      <div className="flex-1 rounded-[16px] border border-red-200 bg-red-50 p-[21px]">
        <div className="flex items-center justify-between">
          <AlertTriangle className="h-[26px] w-[26px] text-red-500" aria-hidden="true" />
          {!isLoading && (data?.flaggedEntries ?? 0) > 0 ? <StatusBadge label="High Risk" tone="danger" /> : null}
        </div>
        <p className="mt-2 text-base font-semibold text-red-700">Flagged Entries</p>
        <p className="text-2xl font-bold text-red-700">{isLoading ? "…" : data?.flaggedEntries ?? 0}</p>
      </div>
    </div>
  );
}

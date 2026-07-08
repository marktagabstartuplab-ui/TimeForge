"use client";

import { Building2, FolderKanban, Users, Gauge, TrendingUp, BadgeCheck } from "lucide-react";
import type { OrgDashboard } from "../api/org-management.service";

export function OrgSummaryCards({ data, isLoading }: { data: OrgDashboard | undefined; isLoading: boolean }) {
  const s = data?.summary;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <Building2 className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <p className="mt-2 text-base text-brand-muted">Total Departments</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-brand-ink">{isLoading ? "…" : s?.totalDepartments ?? 0}</p>
          {!isLoading && (s?.departmentsAddedThisMonth ?? 0) > 0 ? (
            <span className="flex items-center gap-0.5 text-xs font-semibold text-[#16a34a]">
              <TrendingUp className="h-3 w-3" aria-hidden="true" />+{s?.departmentsAddedThisMonth}
            </span>
          ) : null}
        </div>
      </div>

      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <FolderKanban className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <p className="mt-2 text-base text-brand-muted">Active Projects</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-brand-ink">{isLoading ? "…" : s?.activeProjects ?? 0}</p>
          {!isLoading && (s?.projectsAddedThisMonth ?? 0) > 0 ? (
            <span className="text-xs text-brand-muted">+{s?.projectsAddedThisMonth} this month</span>
          ) : null}
        </div>
      </div>

      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <Users className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <p className="mt-2 text-base text-brand-muted">Total Employees</p>
        <div className="flex items-center gap-1.5">
          <p className="text-2xl font-bold text-brand-ink">{isLoading ? "…" : s?.totalEmployees ?? 0}</p>
          <BadgeCheck className="h-4 w-4 text-brand" aria-hidden="true" />
        </div>
      </div>

      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <Gauge className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <p className="mt-2 text-base text-brand-muted">Resource Utilization</p>
        <p className="text-2xl font-bold text-brand-ink">{isLoading ? "…" : `${s?.resourceUtilization ?? 0}%`}</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e4e2e3]">
          <div className="h-full rounded-full bg-brand" style={{ width: `${s?.resourceUtilization ?? 0}%` }} />
        </div>
      </div>
    </div>
  );
}

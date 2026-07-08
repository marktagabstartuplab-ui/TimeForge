"use client";

import { Users2, TrendingUp, AlertTriangle, Activity } from "lucide-react";
import { StatusBadge } from "@/components/shared/StatusBadge";
import type { ScrumDashboard } from "../api/scrum-management.service";

function Sparkline({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="flex h-8 items-end gap-1">
      {data.map((d) => (
        <div
          key={d.date}
          className="w-2.5 rounded-sm bg-brand/70"
          style={{ height: `${Math.max(8, (d.count / max) * 100)}%` }}
          title={`${d.date}: ${d.count}`}
        />
      ))}
    </div>
  );
}

export function ScrumStatsCards({ data, isLoading }: { data: ScrumDashboard | undefined; isLoading: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="flex-1 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <Users2 className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <p className="mt-2 text-base text-brand-muted">Total Teams Reporting</p>
        <p className="text-2xl font-bold text-brand-ink">
          {isLoading ? "…" : `${data?.teamsReporting.count ?? 0}`}
        </p>
        <p className="mt-1 text-xs text-brand-muted">
          {isLoading ? "" : `of ${data?.teamsReporting.total ?? 0} teams`}
        </p>
      </div>

      <div className="flex-1 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <TrendingUp className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <p className="mt-2 text-base text-brand-muted">Overall Participation Rate</p>
        <p className="text-2xl font-bold text-brand-ink">{isLoading ? "…" : `${data?.participationRate ?? 0}%`}</p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#e4e2e3]">
          <div className="h-full rounded-full bg-brand" style={{ width: `${data?.participationRate ?? 0}%` }} />
        </div>
      </div>

      <div className="flex-1 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <AlertTriangle className="h-[26px] w-[26px] text-red-500" aria-hidden="true" />
        <p className="mt-2 text-base text-brand-muted">Active Blockers</p>
        <p className="text-2xl font-bold text-brand-ink">{isLoading ? "…" : `${data?.activeBlockers.count ?? 0}`}</p>
        {!isLoading && (data?.activeBlockers.critical ?? 0) > 0 ? (
          <StatusBadge label="Critical Priority" tone="danger" className="mt-1.5" />
        ) : null}
      </div>

      <div className="flex-1 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
        <Activity className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <p className="mt-2 text-base text-brand-muted">Submission Trend</p>
        {isLoading ? (
          <p className="text-2xl font-bold text-brand-ink">…</p>
        ) : (
          <Sparkline data={data?.submissionTrend.data ?? []} />
        )}
        <p className="mt-1 text-xs text-brand-muted">
          {isLoading ? "" : data?.submissionTrend.direction === "up" ? "Trending up" : data?.submissionTrend.direction === "down" ? "Trending down" : "Steady"}
        </p>
      </div>
    </div>
  );
}

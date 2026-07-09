"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock, FileClock, PalmtreeIcon, Target } from "lucide-react";
import { getDashboardSummary } from "../api/dashboard.service";
import { getMe } from "@/features/account/api/account.service";
import { getLeaveBalances } from "@/features/leave/api/leave.service";
import { StatCard } from "@/components/shared/StatCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { DashboardHero } from "./DashboardHero";

function formatHours(totalMinutes: number): string {
  return `${(totalMinutes / 60).toFixed(1)}h`;
}

export function DashboardContent() {
  const { data: me } = useQuery({ queryKey: ["account", "me"], queryFn: getMe });
  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: getDashboardSummary,
  });
  const { data: leaveBalances, isLoading: isLeaveLoading } = useQuery({
    queryKey: ["leave", "balances"],
    queryFn: getLeaveBalances,
  });

  const kpi = summary?.kpi?.[0];
  const totalRemainingLeave = leaveBalances?.reduce((sum, b) => sum + b.remainingDays, 0);
  const pendingCount = summary?.timesheets.byStatus["SUBMITTED"] ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHero firstName={me?.firstName ?? ""} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Clock}
          label="Hours This Month"
          value={isLoading ? "…" : formatHours(summary?.hours.totalMinutes ?? 0)}
        />
        <StatCard
          icon={FileClock}
          label="Pending Timesheets"
          value={isLoading ? "…" : String(pendingCount)}
        />
        <StatCard
          icon={PalmtreeIcon}
          label="Leave Balance"
          value={isLeaveLoading ? "…" : `${totalRemainingLeave ?? 0}d`}
        />
        <StatCard
          icon={Target}
          label={kpi ? kpi.kpiTemplate.name : "KPI Progress"}
          value={kpi ? `${kpi.currentValue} / ${kpi.targetValue}` : "—"}
          disabled={!kpi}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Weekly Tracked Hours" className="lg:col-span-2">
          <EmptyState variant="comingSoon" message="Daily hour breakdowns arrive with the Time Tracking module." />
        </SectionCard>

        <SectionCard title="Team Status">
          <EmptyState
            variant="restricted"
            message="Team status is available for supervisors and above."
          />
        </SectionCard>
      </div>

      <SectionCard title="Recent Activity">
        <EmptyState message="No recent activity to show yet." />
      </SectionCard>
    </div>
  );
}

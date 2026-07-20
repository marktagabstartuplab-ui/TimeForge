"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, FileClock, PalmtreeIcon, Target } from "lucide-react";
import { getDashboardSummary } from "../api/dashboard.service";
import { getMe, getTeamPresence } from "@/features/account/api/account.service";
import { TeamStatusList } from "@/features/account/components/TeamStatusList";
import { getLeaveBalances } from "@/features/leave/api/leave.service";
import { StatCard } from "@/components/shared/StatCard";
import { SectionCard } from "@/components/shared/SectionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardHero } from "./DashboardHero";
import { WeeklyHoursChart, type DayHours } from "@/components/shared/WeeklyHoursChart";
import { RecentActivityCard } from "@/features/payslips/components/RecentActivityCard";
import { listTimeEntries } from "@/features/time-tracking/api/time-entries.service";
import { minutesBetween, toIsoDate, weekWindow } from "@/lib/time";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
  const presenceQuery = useQuery({ queryKey: ["account", "team-presence"], queryFn: getTeamPresence });

  // Tracked hours for the weekly chart
  const week = useMemo(() => weekWindow(new Date()), []);
  const weekEntriesQuery = useQuery({
    queryKey: ["time-entries", "week", toIsoDate(week.from)],
    queryFn: () =>
      listTimeEntries({ from: week.from.toISOString(), to: week.to.toISOString(), limit: 100 }),
  });

  const weekDays: DayHours[] = useMemo(() => {
    const totals = new Array(7).fill(0);
    const todayKey = toIsoDate(new Date());
    for (const entry of weekEntriesQuery.data?.data ?? []) {
      const start = new Date(entry.startTime);
      const dow = (start.getDay() + 6) % 7;
      const minutes =
        entry.durationMinutes ?? minutesBetween(entry.startTime, entry.endTime ?? new Date().toISOString());
      totals[dow] += minutes;
    }
    return DAY_LABELS.map((label, i) => {
      const day = new Date(week.from);
      day.setDate(day.getDate() + i);
      return { label, hours: Math.round((totals[i] / 60) * 10) / 10, isToday: toIsoDate(day) === todayKey };
    });
  }, [weekEntriesQuery.data, week.from]);

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
          {weekEntriesQuery.isLoading ? (
            <Skeleton className="h-48" />
          ) : (
            <WeeklyHoursChart days={weekDays} />
          )}
        </SectionCard>

        <SectionCard title="Team Status">
          <TeamStatusList isLoading={presenceQuery.isLoading} members={presenceQuery.data} />
        </SectionCard>
      </div>

      <RecentActivityCard />
    </div>
  );
}

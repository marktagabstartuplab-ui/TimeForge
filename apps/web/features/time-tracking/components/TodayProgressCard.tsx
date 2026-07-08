"use client";

import { useQuery } from "@tanstack/react-query";
import { BarChart3, Clock3, Coffee, TrendingUp, CalendarDays } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { WeeklyHoursChart, type DayHours } from "@/components/shared/WeeklyHoursChart";
import { getDashboardSummary } from "@/features/dashboard/api/dashboard.service";
import type { TimeEntry } from "../api/time-entries.service";
import type { DaySummary } from "../lib/day-summary";
import { formatMinutes, formatMinutesClock, minutesBetween, toIsoDate } from "@/lib/time";

const DAY_TARGET_MINUTES = 8 * 60;

interface TodayProgressCardProps {
  /** Today's aggregate (tracked / break minutes). */
  summary: DaySummary;
  /** This week's entries (Mon–Sun) — feeds the real bar chart. */
  weekEntries: TimeEntry[];
  weekLoading: boolean;
}

/** Mon-first weekday labels for the chart. */
const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function buildWeekDays(entries: TimeEntry[], now: Date): DayHours[] {
  const minutesByDay = new Map<string, number>();
  for (const e of entries) {
    const key = toIsoDate(new Date(e.startTime));
    const mins = e.durationMinutes ?? minutesBetween(e.startTime, e.endTime ?? now.toISOString());
    minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + mins);
  }
  const monday = new Date(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const todayKey = toIsoDate(now);

  return WEEK_LABELS.map((label, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const key = toIsoDate(day);
    return {
      label,
      hours: Math.round(((minutesByDay.get(key) ?? 0) / 60) * 10) / 10,
      isToday: key === todayKey,
    };
  });
}

/**
 * Right rail — Today's Progress. Every figure is real: hours from time
 * entries, breaks from session gaps, productivity from the employee's KPI
 * progress rows (GET /dashboard/summary).
 */
export function TodayProgressCard({ summary, weekEntries, weekLoading }: TodayProgressCardProps) {
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: getDashboardSummary,
  });

  const now = new Date();
  const days = buildWeekDays(weekEntries, now);
  const weekMinutes = Math.round(days.reduce((sum, d) => sum + d.hours, 0) * 60);
  const targetPercent = Math.round((summary.trackedMinutes / DAY_TARGET_MINUTES) * 100);

  const kpi = dashboardQuery.data?.kpi?.[0] ?? null;
  const kpiPercent =
    kpi && kpi.targetValue > 0 ? Math.round((kpi.currentValue / kpi.targetValue) * 100) : null;

  const rows: { label: string; value: string; icon: React.ReactNode }[] = [
    {
      label: "Today's Hours",
      value: formatMinutes(summary.trackedMinutes),
      icon: <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      label: "Weekly Hours",
      value: formatMinutes(weekMinutes),
      icon: <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      label: "Break Time",
      value: formatMinutes(summary.breakMinutes),
      icon: <Coffee className="h-3.5 w-3.5" aria-hidden="true" />,
    },
  ];

  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-2.5 border-b border-[#c3c6d2]/40 pb-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-brand-cyan/20 text-brand">
          <TrendingUp className="h-4 w-4" aria-hidden="true" />
        </span>
        <h3 className="text-xl text-brand-navy">Today&apos;s Progress</h3>
      </div>

      {weekLoading ? (
        <div className="mt-4 flex flex-col gap-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-24" />
        </div>
      ) : (
        <>
          {/* Real weekly bars (Mon–Sun, today highlighted) */}
          <WeeklyHoursChart days={days} height={120} className="mt-4" />

          {/* Daily target */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-[0.8px] text-brand-muted">
                Daily Target (8h)
              </span>
              <span className="font-bold text-brand-ink">{targetPercent}%</span>
            </div>
            <ProgressBar percent={targetPercent} label="Progress toward the 8-hour daily target" />
          </div>

          {/* Stat rows */}
          <dl className="mt-4 flex flex-col">
            {rows.map((row, i) => (
              <div
                key={row.label}
                className={
                  i === 0
                    ? "flex items-center justify-between py-2"
                    : "flex items-center justify-between border-t border-[#c3c6d2]/40 py-2"
                }
              >
                <dt className="flex items-center gap-2 text-sm text-brand-muted">
                  <span className="text-brand-muted/70">{row.icon}</span>
                  {row.label}
                </dt>
                <dd className="text-sm font-bold text-brand-ink">{row.value}</dd>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-[#c3c6d2]/40 py-2">
              <dt className="flex items-center gap-2 text-sm text-brand-muted">
                <TrendingUp className="h-3.5 w-3.5 text-brand-muted/70" aria-hidden="true" />
                Current Productivity
              </dt>
              <dd className="text-sm font-bold text-brand-ink">
                {dashboardQuery.isLoading
                  ? "…"
                  : kpiPercent != null
                    ? `${kpiPercent}% · ${kpi?.kpiTemplate.name}`
                    : "No KPI assigned"}
              </dd>
            </div>
          </dl>

          {/* Total tracked tile */}
          <div className="mt-3 flex items-center justify-between rounded-[12px] bg-brand-cyan/10 px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">
                Total Tracked
              </p>
              <p className="font-mono text-xl font-bold tabular-nums text-brand">
                {formatMinutesClock(summary.trackedMinutes)}
              </p>
            </div>
            <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-brand-cyan/20 text-brand">
              <BarChart3 className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
          </div>
        </>
      )}
    </div>
  );
}

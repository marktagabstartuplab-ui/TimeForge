"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarCheck2,
  CheckSquare,
  Gauge,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { ProgressRing } from "@/components/shared/ProgressRing";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { WeeklyHoursChart, type DayHours } from "@/components/shared/WeeklyHoursChart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listKpiProgress, type KpiProgressRow } from "../api/kpi.service";
import { listTimeEntries } from "@/features/time-tracking/api/time-entries.service";
import { endOfDay, minutesBetween, startOfDay, toIsoDate } from "@/lib/time";

const HERO_ICONS: LucideIcon[] = [Zap, CalendarCheck2, CheckSquare];
const RANGE_OPTIONS = [
  { value: "7", label: "Last 7 Days" },
  { value: "14", label: "Last 14 Days" },
  { value: "30", label: "Last 30 Days" },
] as const;

function pct(row: KpiProgressRow): number {
  const target = Number(row.targetValue);
  if (!target) return 0;
  return Math.min(100, Math.round((Number(row.currentValue) / target) * 100));
}

export function ReportsContent() {
  const [rangeDays, setRangeDays] = useState<string>("7");

  const kpiQuery = useQuery({ queryKey: ["kpi", "progress"], queryFn: () => listKpiProgress() });

  const trendWindow = useMemo(() => {
    const to = endOfDay(new Date());
    const from = startOfDay(new Date());
    from.setDate(from.getDate() - (Number(rangeDays) - 1));
    return { from, to };
  }, [rangeDays]);

  const trendQuery = useQuery({
    queryKey: ["time-entries", "trend", rangeDays],
    queryFn: () =>
      listTimeEntries({
        from: trendWindow.from.toISOString(),
        to: trendWindow.to.toISOString(),
        limit: 100,
      }),
  });

  const trendDays: DayHours[] = useMemo(() => {
    const dayCount = Number(rangeDays);
    const totals = new Map<string, number>();
    for (const entry of trendQuery.data?.data ?? []) {
      const key = toIsoDate(new Date(entry.startTime));
      const minutes =
        entry.durationMinutes ?? minutesBetween(entry.startTime, entry.endTime ?? new Date().toISOString());
      totals.set(key, (totals.get(key) ?? 0) + minutes);
    }
    const todayKey = toIsoDate(new Date());
    const days: DayHours[] = [];
    for (let i = 0; i < dayCount; i++) {
      const day = new Date(trendWindow.from);
      day.setDate(day.getDate() + i);
      const key = toIsoDate(day);
      days.push({
        label:
          dayCount <= 7
            ? day.toLocaleDateString("en-US", { weekday: "short" })
            : day.toLocaleDateString("en-US", { day: "numeric" }),
        hours: Math.round(((totals.get(key) ?? 0) / 60) * 10) / 10,
        isToday: key === todayKey,
      });
    }
    return days;
  }, [trendQuery.data, trendWindow, rangeDays]);

  const rows = kpiQuery.data ?? [];
  const heroRows = rows.slice(0, 3);
  const stripRows = rows.slice(3, 7);
  const average =
    rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + pct(row), 0) / rows.length) : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Performance Insights"
        subtitle="Your KPI progress and tracked-hours trends."
        action={
          <Select
            value={rangeDays}
            onValueChange={(v) => setRangeDays(v as string)}
            items={RANGE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          >
            <SelectTrigger
              aria-label="Date range"
              className="h-10 min-w-36 rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {kpiQuery.isError ? (
        <ErrorState message="Could not load your KPI progress." onRetry={() => kpiQuery.refetch()} />
      ) : kpiQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          variant="comingSoon"
          message="No KPI progress yet — metrics appear once your organization assigns KPI templates and timesheets are approved."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {heroRows.map((row, i) => {
              const Icon = HERO_ICONS[i % HERO_ICONS.length];
              return (
                <div
                  key={row.id}
                  className="flex flex-col gap-2 rounded-[16px] border border-[#c3c6d2]/50 border-t-4 border-t-brand bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">
                        {row.kpiTemplate?.name ?? "KPI"}
                      </p>
                      <p className="mt-1 text-[34px] font-bold leading-none text-brand-navy">
                        {Number(row.currentValue)}
                        <span className="text-xl text-brand-muted"> / {Number(row.targetValue)}</span>
                      </p>
                    </div>
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-cyan/20 text-brand">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                  </div>
                  <ProgressBar percent={pct(row)} label={`${row.kpiTemplate?.name ?? "KPI"} progress`} />
                  <p className="text-xs text-brand-muted">
                    {pct(row)}% of target · {row.periodKey}
                  </p>
                </div>
              );
            })}
          </div>

          {stripRows.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stripRows.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-2 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">
                    {row.kpiTemplate?.name ?? "KPI"}
                  </p>
                  <p className="text-[26px] font-bold leading-none text-brand-ink">{pct(row)}%</p>
                  <ProgressBar
                    percent={pct(row)}
                    barClassName="bg-brand-cyan"
                    label={`${row.kpiTemplate?.name ?? "KPI"} progress`}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
            <SectionCard
              title="Productivity Overview"
              className="lg:col-span-2"
              action={
                <StatusBadge
                  label={average >= 70 ? "On Track" : "Needs Attention"}
                  tone={average >= 70 ? "success" : "warning"}
                />
              }
            >
              <div className="flex flex-col gap-5">
                {rows.map((row) => (
                  <div key={row.id} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm font-semibold text-brand-ink">
                        {row.kpiTemplate?.name ?? "KPI"}
                      </p>
                      <p className="text-sm text-brand-muted">
                        {Number(row.currentValue)} / {Number(row.targetValue)} ({pct(row)}%)
                      </p>
                    </div>
                    <ProgressBar percent={pct(row)} label={`${row.kpiTemplate?.name ?? "KPI"}`} />
                    <p className="text-right text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">
                      Target: {Number(row.targetValue)}{" "}
                      {row.kpiTemplate?.metricType === "HOURS" ? "hours" : ""}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Overall Score">
              <div className="flex flex-col items-center gap-4 py-2">
                <ProgressRing percent={average} label={`Overall KPI score ${average}%`} />
                <p className="text-center text-sm text-brand-muted">
                  Average completion across your {rows.length} active KPI
                  {rows.length === 1 ? "" : "s"} — team baseline comparison needs backend support.
                </p>
              </div>
            </SectionCard>
          </div>
        </>
      )}

      <SectionCard title="Weekly Performance Trend">
        <p className="-mt-4 text-sm text-brand-muted">
          Tracked hours per day over the selected range.
        </p>
        {trendQuery.isError ? (
          <ErrorState message="Could not load tracked hours." onRetry={() => trendQuery.refetch()} />
        ) : trendQuery.isLoading ? (
          <Skeleton className="h-48" />
        ) : (
          <WeeklyHoursChart days={trendDays} />
        )}
      </SectionCard>

      <p className="flex items-center gap-2 text-xs text-brand-muted">
        <Gauge className="h-4 w-4" aria-hidden="true" />
        Efficiency, attendance, punctuality and focus scores from the design need backend support —
        no scoring endpoints exist yet. Shown here: real KPI progress and tracked hours.
      </p>
    </div>
  );
}

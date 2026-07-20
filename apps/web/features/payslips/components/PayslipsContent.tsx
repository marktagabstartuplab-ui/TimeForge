"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clock3, Download, Landmark, Loader2, Lock, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { SectionCard } from "@/components/shared/SectionCard";
import { MetricCard } from "@/components/shared/MetricCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusBadge, payrollStatusTone } from "@/components/shared/StatusBadge";
import { WeeklyHoursChart, type DayHours } from "@/components/shared/WeeklyHoursChart";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Toast, type ToastState } from "@/components/shared/Toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMyPayroll, getUserRate, downloadPayslipPdf, type PayrollLineItemSelf } from "../api/payroll.service";
import { getMe, getTeamPresence } from "@/features/account/api/account.service";
import { TeamStatusList } from "@/features/account/components/TeamStatusList";
import { listTimeEntries } from "@/features/time-tracking/api/time-entries.service";
import { RecentActivityCard } from "./RecentActivityCard";
import { useCan } from "@/features/auth/rbac";
import { useAuth } from "@/providers/auth-provider";
import { formatPeriodRange, minutesBetween, toIsoDate, weekWindow } from "@/lib/time";

const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

function hoursOf(item: PayrollLineItemSelf): number {
  return Number(item.approvedHours) + Number(item.overtimeHours);
}

function periodLabel(item: PayrollLineItemSelf): string {
  const { startDate, endDate } = item.payrollReport.period;
  return formatPeriodRange(new Date(startDate), new Date(endDate));
}

export function PayslipsContent() {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const payrollQuery = useQuery({ queryKey: ["payroll", "me"], queryFn: getMyPayroll });
  const meQuery = useQuery({ queryKey: ["account", "me"], queryFn: getMe });
  const presenceQuery = useQuery({ queryKey: ["account", "team-presence"], queryFn: getTeamPresence });

  const rateQuery = useQuery({
    queryKey: ["payroll", "rate", user?.id],
    queryFn: () => getUserRate(user!.id),
    enabled: Boolean(user?.id),
  });

  const downloadPayslipMutation = useMutation({
    mutationFn: (id: string) => downloadPayslipPdf(id),
    onError: (err: any) => setToast({ message: err?.message || "Failed to download payslip.", tone: "error" }),
  });

  // This week's tracked hours for the chart.
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

  const items = useMemo(() => payrollQuery.data ?? [], [payrollQuery.data]);
  const selected = items.find((i) => i.id === selectedId) ?? items[0] ?? null;

  const accumulatedHours = selected ? hoursOf(selected) : 0;
  
  // Rate is only restricted if the query failed (e.g., 403 Forbidden).
  // If the query succeeded but hourlyRate is null, it just means it's not configured.
  const isRateRestricted = rateQuery.isError;
  const rate = rateQuery.data?.hourlyRate != null ? Number(rateQuery.data.hourlyRate) : null;

  const columns: DataTableColumn<PayrollLineItemSelf>[] = [
    {
      key: "period",
      header: "Pay Period",
      render: (item) => <span className="font-semibold">{periodLabel(item)}</span>,
    },
    {
      key: "hours",
      header: "Hours",
      render: (item) => hoursOf(item).toFixed(1),
    },
    {
      key: "pending",
      header: "Pending",
      render: (item) => `${Number(item.pendingHours).toFixed(1)} h`,
    },
    {
      key: "gross",
      header: "Gross Pay",
      render: (item) => {
        if (isRateRestricted) {
          return (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex items-center gap-1 text-brand-muted">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Restricted
                  </span>
                }
              />
              <TooltipContent>Pay amounts are visible to Finance/Admin only (BR-PAY-06).</TooltipContent>
            </Tooltip>
          );
        }
        if (rate == null) {
          return <span className="text-brand-muted italic">Not Set</span>;
        }
        return `₱${(hoursOf(item) * rate).toFixed(2)}`;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (item) => <StatusBadge {...payrollStatusTone(item.payrollReport.period.status)} />,
    },
    {
      key: "action",
      header: "Action",
      className: "text-right",
      render: (item) => (
        <button
          type="button"
          disabled={downloadPayslipMutation.isPending}
          onClick={() => downloadPayslipMutation.mutate(item.id)}
          className="rounded-full p-2 text-brand hover:bg-brand/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {downloadPayslipMutation.isPending && downloadPayslipMutation.variables === item.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <PageHeader title="Payslips" subtitle="Your approved hours and payroll history." />

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

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-brand">Payslip Summary</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Period:</span>
            <Select
              value={selected?.id ?? ""}
              onValueChange={(value) => setSelectedId(value as string)}
              items={items.map((item) => ({ value: item.id, label: periodLabel(item) }))}
            >
              <SelectTrigger
                aria-label="Payslip period"
                className="h-10 min-w-44 rounded-[10px] border-[#c3c6d2] bg-white px-3.5 text-sm"
              >
                <SelectValue placeholder={items.length ? "Select period" : "No periods yet"} />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {periodLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {payrollQuery.isError ? (
          <ErrorState message="Could not load your payroll data." onRetry={() => payrollQuery.refetch()} />
        ) : payrollQuery.isLoading || rateQuery.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard
              icon={Clock3}
              label="Accumulated Hours"
              value={accumulatedHours.toFixed(1)}
              valueSuffix="hrs"
              caption={selected ? periodLabel(selected) : "No payroll line items yet"}
            />
            {isRateRestricted ? (
              <MetricCard
                icon={Lock}
                iconTone="bg-[#e4e2e3] text-brand-muted"
                label="Base Rate"
                value="Restricted"
                caption="Rates are visible to Finance/Admin only."
              />
            ) : rate != null ? (
              <MetricCard
                icon={TrendingUp}
                label="Base Rate"
                value={`₱${rate.toFixed(2)}`}
                valueSuffix="/ hr"
              />
            ) : (
              <MetricCard
                icon={TrendingUp}
                iconTone="bg-gray-100 text-brand-muted"
                label="Base Rate"
                value="Not Set"
                caption="HR has not configured an hourly rate."
              />
            )}
            
            {isRateRestricted ? (
              <MetricCard
                icon={Lock}
                iconTone="bg-[#e4e2e3] text-brand-muted"
                label="Est. Total Payout (Gross)"
                value="Restricted"
                caption="Pay amounts are excluded from the employee self-view."
              />
            ) : rate != null ? (
              <MetricCard
                icon={Landmark}
                label="Est. Total Payout (Gross)"
                value={`₱${(accumulatedHours * rate).toFixed(2)}`}
                emphasis
              />
            ) : (
              <MetricCard
                icon={Landmark}
                iconTone="bg-gray-100 text-brand-muted"
                label="Est. Total Payout (Gross)"
                value="Not Set"
                caption="Cannot calculate without a base rate."
              />
            )}
          </div>
        )}
      </div>

      <SectionCard title="Historical Records">
        <DataTable
          aria-label="Payslip history"
          columns={columns}
          rows={items}
          rowKey={(item) => item.id}
          emptyState={
            <EmptyState message="No payroll records yet — line items appear after Finance generates a payroll period." />
          }
        />
      </SectionCard>

      <RecentActivityCard />
    </div>
  );
}

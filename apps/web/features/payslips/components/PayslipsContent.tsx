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
import { cn } from "@/lib/utils";

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

  // Colleagues' live clock-in/out status is supervisor/admin information — it has
  // no bearing on an employee's own payslips, so it is not rendered (or even
  // fetched) for a regular employee.
  const isManager = user
    ? user.roles.includes("SUPERVISOR") || user.roles.includes("ADMIN")
    : false;

  const payrollQuery = useQuery({ queryKey: ["payroll", "me"], queryFn: getMyPayroll });
  const meQuery = useQuery({ queryKey: ["account", "me"], queryFn: getMe });
  const presenceQuery = useQuery({
    queryKey: ["account", "team-presence"],
    queryFn: getTeamPresence,
    enabled: isManager,
  });

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
        const periodStatus = item.payrollReport.period.status;
        const isFinalized = periodStatus === "LOCKED" || periodStatus === "EXPORTED";
        // Use the line item's snapshotted hourly rate and estimated pay from the generated report
        // to guarantee 100% parity with Finance & HR payroll tables.
        const itemRate = item.hourlyRate != null ? Number(item.hourlyRate) : rate;
        const calcPay = item.estimatedPay != null ? Number(item.estimatedPay) : (itemRate != null ? hoursOf(item) * itemRate : null);
        if (calcPay == null) {
          return <span className="text-brand-muted italic">Not Set</span>;
        }
        const grossAmount = `₱${calcPay.toFixed(2)}`;
        if (!isFinalized) {
          return (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600">
                    ~{grossAmount} Est.
                  </span>
                }
              />
              <TooltipContent>This is an estimated amount — the payroll period is still being processed and the figure may change.</TooltipContent>
            </Tooltip>
          );
        }
        return <span className="font-semibold">{grossAmount}</span>;
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
      render: (item) => {
        const periodStatus = item.payrollReport.period.status;
        const isFinalized = periodStatus === "LOCKED" || periodStatus === "EXPORTED";
        if (!isFinalized) {
          return (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-brand-muted cursor-default">
                    <Clock3 className="h-4 w-4" aria-hidden="true" />
                  </span>
                }
              />
              <TooltipContent>Payslip download is available once this period is finalized.</TooltipContent>
            </Tooltip>
          );
        }
        return (
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
        );
      },
    },
  ];


  if (meQuery.data?.employmentType === "INTERN") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Payslips" subtitle="Your approved hours and payroll history." />
        <div className="flex h-[400px] flex-col items-center justify-center rounded-[16px] border border-[#c3c6d2]/40 bg-white p-6 text-center">
          <Lock className="h-10 w-10 text-brand-muted/80" />
          <p className="mt-2 text-sm font-semibold text-brand-muted">Access Restricted</p>
          <p className="mt-1 text-xs text-brand-muted/70">Intern accounts are not eligible for payroll benefits or payslip tracking.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <PageHeader title="Payslips" subtitle="Your approved hours and payroll history." />

      <div className={cn("grid grid-cols-1 gap-4", isManager && "lg:grid-cols-3")}>
        <SectionCard title="Weekly Tracked Hours" className={cn(isManager && "lg:col-span-2")}>
          {weekEntriesQuery.isLoading ? (
            <Skeleton className="h-48" />
          ) : (
            <WeeklyHoursChart days={weekDays} />
          )}
        </SectionCard>
        {isManager ? (
          <SectionCard title="Team Status">
            <TeamStatusList isLoading={presenceQuery.isLoading} members={presenceQuery.data} />
          </SectionCard>
        ) : null}
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
            ) : (() => {
                const selectedRate = selected?.hourlyRate != null ? Number(selected.hourlyRate) : rate;
                const selectedPay = selected?.estimatedPay != null ? Number(selected.estimatedPay) : (selectedRate != null ? accumulatedHours * selectedRate : null);
                if (selectedPay != null) {
                  return (
                    <MetricCard
                      icon={Landmark}
                      label="Est. Total Payout (Gross)"
                      value={`₱${selectedPay.toFixed(2)}`}
                      emphasis
                    />
                  );
                }
                return (
                  <MetricCard
                    icon={Landmark}
                    iconTone="bg-gray-100 text-brand-muted"
                    label="Est. Total Payout (Gross)"
                    value="Not Set"
                    caption="Cannot calculate without a base rate."
                  />
                );
              })()}
          </div>
        )}
      </div>

      {/* ── Category Breakdown Card (NSD, Holiday, Rest Day, OT, Deductions) ── */}
      {selected ? (
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between border-b border-[#c3c6d2]/30 pb-4 mb-4">
            <div>
              <h3 className="text-lg font-bold text-brand-navy">
                Payslip Category Breakdown — {periodLabel(selected)}
              </h3>
              <p className="text-xs text-brand-muted mt-0.5">
                Itemized breakdown of regular vs. Philippine labor premium categories.
              </p>
            </div>
            <StatusBadge {...payrollStatusTone(selected.payrollReport.period.status)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Earnings / Premium Hours Table */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-brand mb-3">
                Earnings &amp; Premium Hours
              </h4>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                  <span className="text-brand-muted">Regular Hours</span>
                  <div className="text-right">
                    <span className="font-semibold text-brand-navy">
                      {(Number(selected.approvedHours) - Number(selected.overtimeHours)).toFixed(1)} hrs
                    </span>
                    {selected.regularPay ? (
                      <span className="ml-3 font-bold text-brand-navy">₱{Number(selected.regularPay).toFixed(2)}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                  <span className="text-brand-muted">Overtime Hours</span>
                  <div className="text-right">
                    <span className="font-semibold text-brand-navy">
                      {Number(selected.overtimeHours).toFixed(1)} hrs
                    </span>
                    {selected.overtimePay ? (
                      <span className="ml-3 font-bold text-brand">₱{Number(selected.overtimePay).toFixed(2)}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <span className="text-emerald-700 font-medium">Night Shift Differential (NSD)</span>
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                      +10%
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-emerald-700">
                      {Number(selected.nightDiffHours ?? 0).toFixed(1)} hrs
                    </span>
                    {selected.nightDifferential ? (
                      <span className="ml-3 font-bold text-emerald-700">₱{Number(selected.nightDifferential).toFixed(2)}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <span className="text-blue-700 font-medium">Holiday Hours</span>
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      100% / 30%
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-blue-700">
                      {Number(selected.holidayHours ?? 0).toFixed(1)} hrs
                    </span>
                    {selected.holidayPay ? (
                      <span className="ml-3 font-bold text-blue-700">₱{Number(selected.holidayPay).toFixed(2)}</span>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-between py-1.5 border-b border-gray-100">
                  <div className="flex items-center gap-1.5">
                    <span className="text-purple-700 font-medium">Rest Day Hours</span>
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                      +30%
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-purple-700">
                      {Number(selected.restDayHours ?? 0).toFixed(1)} hrs
                    </span>
                    {selected.restDayPay ? (
                      <span className="ml-3 font-bold text-purple-700">₱{Number(selected.restDayPay).toFixed(2)}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Totals Summary */}
            <div className="bg-[#faf9f9] rounded-xl p-5 border border-[#c3c6d2]/30 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-brand-navy mb-3">
                  Summary Totals
                </h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-brand-muted">Gross Earnings</span>
                    <span className="font-bold text-brand-navy text-base">
                      {selected.grossTotal ? `₱${Number(selected.grossTotal).toFixed(2)}` : `₱${Number(selected.estimatedPay).toFixed(2)}`}
                    </span>
                  </div>
                  {selected.totalDeductions ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-brand-muted">Statutory Deductions (SSS/PhilHealth/Pag-IBIG/BIR)</span>
                      <span className="font-semibold text-red-600">
                        -₱{Number(selected.totalDeductions).toFixed(2)}
                      </span>
                    </div>
                  ) : null}
                  {selected.deMinimisTotal && Number(selected.deMinimisTotal) !== 0 ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-brand-muted">
                        De Minimis Benefits (non-taxable)
                      </span>
                      <span className="font-semibold text-emerald-700">
                        +₱{Number(selected.deMinimisTotal).toFixed(2)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="pt-4 border-t border-[#c3c6d2]/40 mt-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-muted block">Net Take-Home Pay</span>
                  <span className="text-2xl font-extrabold text-brand">
                    {selected.netPay ? `₱${Number(selected.netPay).toFixed(2)}` : `₱${Number(selected.estimatedPay).toFixed(2)}`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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

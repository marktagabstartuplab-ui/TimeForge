"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wallet,
  Users,
  FileClock,
  Sparkles,
  CalendarRange,
  Download,
  RefreshCw,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Building2,
} from "lucide-react";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast, type ToastState } from "@/components/shared/Toast";
import {
  getHrSummary,
  getHrExecutiveSummary,
  generateHrReport,
  getHrDepartments,
  exportHrReportCsv,
} from "../api/hr-dashboard.service";
import { HrRecentActivityPanel } from "./HrRecentActivityPanel";

const RISK_TONE: Record<string, BadgeTone> = { LOW: "success", MEDIUM: "warning", HIGH: "danger" };
const RISK_BAR: Record<string, string> = { LOW: "bg-emerald-500 w-1/4", MEDIUM: "bg-amber-500 w-2/3", HIGH: "bg-red-500 w-full" };

const STATUS_TONE: Record<string, BadgeTone> = { OPTIMIZED: "success", ON_TRACK: "info", NEEDS_REVIEW: "danger" };
const STATUS_LABEL: Record<string, string> = { OPTIMIZED: "Optimized", ON_TRACK: "On Track", NEEDS_REVIEW: "Needs Review" };

function formatCurrency(n: number): string {
  return `₱${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

export function HRDashboardContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);

  const { data: summary, isLoading: isSummaryLoading, isError: isSummaryError } = useQuery({
    queryKey: ["hr-dashboard", "summary"],
    queryFn: getHrSummary,
    refetchInterval: 30_000,
  });

  const { data: exec, isLoading: isExecLoading, isError: isExecError } = useQuery({
    queryKey: ["hr-dashboard", "executive-summary"],
    queryFn: getHrExecutiveSummary,
  });

  const { data: departments = [], isLoading: isDeptLoading, isError: isDeptError } = useQuery({
    queryKey: ["hr-dashboard", "departments"],
    queryFn: getHrDepartments,
  });

  const generateMutation = useMutation({
    mutationFn: generateHrReport,
    onSuccess: () => {
      setToast({ message: "New executive report generated.", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["hr-dashboard", "executive-summary"] });
    },
    onError: (err: any) => setToast({ message: err?.message || "Failed to generate report.", tone: "error" }),
  });

  const exportMutation = useMutation({
    mutationFn: exportHrReportCsv,
    onSuccess: () => setToast({ message: "Export downloaded.", tone: "success" }),
    onError: (err: any) => setToast({ message: err?.message || "Export failed.", tone: "error" }),
  });

  const v = (n: number | undefined) => (isSummaryLoading ? "…" : String(n ?? 0));
  const totalHeadcount = departments.reduce((s, d) => s + d.headcount, 0) || 1;
  const staffingRecommendation = (() => {
    const overloaded = [...departments].filter((d) => d.status === "NEEDS_REVIEW");
    const candidates = departments.filter((d) => !overloaded.includes(d));
    const strongest = [...candidates].sort((a, b) => b.efficiency - a.efficiency)[0];
    if (overloaded.length > 0 && strongest && strongest.efficiency > overloaded[0].efficiency) {
      return `Consider reallocating floaters from ${strongest.name} to ${overloaded.map((d) => d.name).join(", ")} to close the efficiency gap.`;
    }
    if (overloaded.length > 0) {
      return `${overloaded.map((d) => d.name).join(", ")} ${overloaded.length === 1 ? "needs" : "need"} closer staffing review — efficiency data is too thin to recommend a specific reallocation yet.`;
    }
    return "Workforce distribution is balanced across departments — no reallocation needed right now.";
  })();

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Dashboard Overview</h1>
          <p className="text-sm text-brand-muted">
            Real-time workforce metrics{summary?.payrollPeriod ? ` for ${formatDateShort(summary.payrollPeriod.startDate)} – ${formatDateShort(summary.payrollPeriod.endDate)}` : ""}.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
            className="flex items-center gap-1.5 rounded-[8px] border border-[#c3c6d2] px-3 py-2 text-sm font-medium text-brand-navy transition-colors hover:bg-[#f6f3f4] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exportMutation.isPending ? "Exporting…" : "Export CSV"}
          </button>
          <button
            type="button"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="flex items-center gap-1.5 rounded-[8px] bg-brand px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#1467d6] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${generateMutation.isPending ? "animate-spin" : ""}`} />
            {generateMutation.isPending ? "Generating…" : "Generate New Report"}
          </button>
        </div>
      </div>

      {isSummaryError ? (
        <EmptyState message="Couldn't load dashboard metrics. Try refreshing." />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard icon={Wallet} label="Total Payroll (Period)" value={isSummaryLoading ? "…" : formatCurrency(summary?.totalPayroll ?? 0)} />
          <StatCard icon={Users} label="Active Employees" value={v(summary?.activeEmployees)} />
          <StatCard
            icon={FileClock}
            label="Pending Timesheets"
            value={v(summary?.pendingTimesheets)}
            badge={summary && summary.pendingTimesheets > 0 ? String(summary.pendingTimesheets) : undefined}
          />
          <StatCard icon={Sparkles} label="AI Efficiency Score" value={isSummaryLoading ? "…" : `${summary?.aiEfficiencyScore ?? 0}%`} />
          <StatCard
            icon={CalendarRange}
            label="Payroll Period"
            value={
              isSummaryLoading
                ? "…"
                : summary?.payrollPeriod
                  ? `${formatDateShort(summary.payrollPeriod.startDate)} – ${formatDateShort(summary.payrollPeriod.endDate)}`
                  : "No period yet"
            }
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Executive AI Summary"
          className="lg:col-span-2"
          action={<Sparkles className="h-5 w-5 text-brand" aria-hidden="true" />}
        >
          {isExecLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : isExecError || !exec ? (
            <EmptyState message="Couldn't load the executive summary. Try Generate New Report." />
          ) : (
            <div className="flex flex-col gap-5">
              <p className="text-sm leading-relaxed text-brand-ink">{exec.summary}</p>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-brand-muted">Action Recommendations</h4>
                  <ul className="flex flex-col gap-2">
                    {exec.actionRecommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm text-brand-ink">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-brand-muted">Forecasted Risk</h4>
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-brand-ink">Overtime Risk</span>
                        <StatusBadge label={exec.forecastedRisk.overtimeRisk} tone={RISK_TONE[exec.forecastedRisk.overtimeRisk]} />
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#e4e2e3]">
                        <div className={`h-1.5 rounded-full ${RISK_BAR[exec.forecastedRisk.overtimeRisk]}`} />
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium text-brand-ink">Turnover Probability</span>
                        <StatusBadge label={exec.forecastedRisk.turnoverProbability} tone={RISK_TONE[exec.forecastedRisk.turnoverProbability]} />
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-[#e4e2e3]">
                        <div className={`h-1.5 rounded-full ${RISK_BAR[exec.forecastedRisk.turnoverProbability]}`} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        <div className="flex flex-col gap-4">
          <HrRecentActivityPanel />

          <SectionCard title="Resource Allocation" action={<Building2 className="h-5 w-5 text-brand-muted" aria-hidden="true" />}>
            {isDeptLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : isDeptError || departments.length === 0 ? (
              <EmptyState message="No department data yet." />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2.5">
                  {departments.map((d) => {
                    const pct = Math.round((d.headcount / totalHeadcount) * 100);
                    return (
                      <div key={d.id}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-brand-ink">{d.name}</span>
                          <span className="text-brand-muted">{d.headcount} ({pct}%)</span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-[#e4e2e3]">
                          <div className="h-1.5 rounded-full bg-brand" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="border-t border-[#c3c6d2]/40 pt-3 text-xs text-brand-muted">{staffingRecommendation}</p>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Detailed Departmental Analytics">
        {isDeptLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : isDeptError ? (
          <EmptyState message="Couldn't load department analytics." />
        ) : departments.length === 0 ? (
          <EmptyState message="No departments found for this organization yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Headcount</th>
                  <th className="py-3 px-4">Payroll Allocation</th>
                  <th className="py-3 px-4">Attendance Rate</th>
                  <th className="py-3 px-4">Efficiency</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/30">
                {departments.map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-3 px-4 font-semibold text-brand-navy">{d.name}</td>
                    <td className="py-3 px-4 text-brand-ink">{d.headcount}</td>
                    <td className="py-3 px-4 text-brand-ink">{formatCurrency(d.payrollAllocation)}</td>
                    <td className="py-3 px-4 text-brand-ink">{d.attendanceRate}%</td>
                    <td className="py-3 px-4">
                      <span className="flex items-center gap-1.5">
                        {d.efficiency >= 95 ? (
                          <TrendingUp className="h-4 w-4 text-emerald-600" />
                        ) : d.efficiency < 80 ? (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        )}
                        {d.efficiency}%
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge label={STATUS_LABEL[d.status]} tone={STATUS_TONE[d.status]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

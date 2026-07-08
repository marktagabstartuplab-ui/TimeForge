"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wallet,
  Users,
  FileClock,
  Sparkles,
  CalendarRange,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  UserPlus,
  FileText,
  ShieldCheck,
  Download,
  BarChart3,
  ExternalLink,
  ArrowRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Link from "next/link";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge, timesheetStatusTone, type BadgeTone } from "@/components/shared/StatusBadge";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { getHrAiInsights } from "../api/hr-ai-insights.service";
import type { HrAiInsightsResponse } from "../api/hr-ai-insights.service";

function formatCurrency(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "2-digit" });
}

const SEVERITY_ICON: Record<string, typeof AlertTriangle> = {
  PAYROLL_ALERT: Clock,
  ATTENDANCE_ANOMALY: BarChart3,
  COMPLIANCE_RISK: ShieldCheck,
  CRITICAL_ERROR: XCircle,
  RECOMMENDED_ACTION: CheckCircle2,
};

const SEVERITY_TONE: Record<string, BadgeTone> = {
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "info",
};

const OVERSIGHT_STAGES = [
  { key: "dataSync", label: "Data Sync", icon: RefreshCw },
  { key: "aiValidation", label: "AI Validation", icon: Sparkles },
  { key: "payrollProcessing", label: "Payroll Processing", icon: Clock },
  { key: "readyForFinance", label: "Ready for Finance", icon: CheckCircle2 },
] as const;

const SHORTCUTS = [
  { label: "Add Staff", route: "/admin/employees", icon: UserPlus, description: "Onboard new hires" },
  { label: "Tax Forms", route: "/admin/payroll", icon: FileText, description: "W-2 / 1099 filings" },
  { label: "Compliance Reports", route: "/admin/reports", icon: ShieldCheck, description: "Regulatory filings" },
  { label: "Payroll Export", route: "/admin/payroll", icon: Download, description: "Export payroll data" },
] as const;

function OversightBar({ status, progress }: { status: string; progress: number }) {
  const color =
    status === "COMPLETED" ? "bg-emerald-500" : status === "IN_PROGRESS" ? "bg-amber-500" : "bg-[#e4e2e3]";
  return (
    <div className="h-2 w-full rounded-full bg-[#e4e2e3]">
      <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${progress}%` }} />
    </div>
  );
}

export function HRAIInsightsContent() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<ToastState | null>(null);

  const {
    data: insights,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["hr-ai-insights"],
    queryFn: getHrAiInsights,
    refetchInterval: 60_000,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      queryClient.invalidateQueries({ queryKey: ["hr-ai-insights"] });
    },
    onSuccess: () => setToast({ message: "Insights refreshed.", tone: "success" }),
    onError: (err: any) => setToast({ message: err?.message || "Refresh failed.", tone: "error" }),
  });

  if (isError) {
    return (
      <div className="flex flex-col gap-6">
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-brand-navy">HR AI Insights</h1>
            <p className="text-sm text-brand-muted">AI-powered workforce analytics</p>
          </div>
        </div>
        <ErrorState message="Could not load AI insights." onRetry={() => refetch()} />
      </div>
    );
  }

  const s = insights?.summaryCards;

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">HR AI Insights</h1>
          <p className="text-sm text-brand-muted">
            AI-powered workforce analytics
            {s?.activePayrollCycle ? ` for period ending ${formatDateShort(s.activePayrollCycle.endDate)}` : ""}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="flex items-center gap-1.5 rounded-[8px] bg-brand px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#1467d6] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? "animate-spin" : ""}`} />
          {refreshMutation.isPending ? "Refreshing…" : "Refresh Insights"}
        </button>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[16px] border border-[#c3c6d2]/50 p-[21px]">
              <Skeleton className="mb-2 h-6 w-6" />
              <Skeleton className="mb-1 h-4 w-24" />
              <Skeleton className="h-7 w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={CalendarRange}
            label="Active Payroll Cycle"
            value={s?.activePayrollCycle ? `${formatDateShort(s.activePayrollCycle.startDate)} - ${formatDateShort(s.activePayrollCycle.endDate)}` : "No active cycle"}
            badge={s?.activePayrollCycle?.status ?? undefined}
          />
          <StatCard icon={Wallet} label="Estimated Workforce Cost" value={formatCurrency(s?.estimatedWorkforceCost ?? 0)} />
          <StatCard icon={FileClock} label="Timesheet Compliance" value={s ? `${s.timesheetCompliance}%` : "…"} />
          <StatCard icon={Sparkles} label="AI Efficiency Gain" value={s ? `${s.aiEfficiencyGain}%` : "…"} />
        </div>
      )}

      {/* Payroll Oversight Hub + AI Action Center */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Payroll Oversight */}
        <SectionCard title="Payroll Oversight Hub" action={<RefreshCw className="h-5 w-5 text-brand-muted" aria-hidden="true" />}>
          {isLoading ? (
            <div className="flex flex-col gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-2 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {OVERSIGHT_STAGES.map((stage) => {
                const data = insights?.payrollOversight[stage.key as keyof typeof insights.payrollOversight];
                if (!data) return null;
                const isComplete = data.status === "COMPLETED";
                const isInProgress = data.status === "IN_PROGRESS";
                const progress = "progress" in data ? (data as any).progress : isComplete ? 100 : isInProgress ? 50 : 0;
                return (
                  <div key={stage.key}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <stage.icon
                          className={`h-4 w-4 ${isComplete ? "text-emerald-600" : isInProgress ? "text-amber-500" : "text-brand-muted"}`}
                          aria-hidden="true"
                        />
                        <span className="text-sm font-medium text-brand-ink">{stage.label}</span>
                      </div>
                      <StatusBadge
                        label={data.status === "COMPLETED" ? "Completed" : data.status === "IN_PROGRESS" ? "In Progress" : "Pending"}
                        tone={isComplete ? "success" : isInProgress ? "warning" : "neutral"}
                      />
                    </div>
                    <OversightBar status={data.status} progress={progress} />
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        {/* AI Action Center */}
        <SectionCard
          title="AI Action Center"
          action={
            insights && insights.aiActionCenter.totalAlerts > 0 ? (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600">
                {insights.aiActionCenter.totalAlerts}
              </span>
            ) : (
              <Sparkles className="h-5 w-5 text-brand-muted" aria-hidden="true" />
            )
          }
        >
          {isLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !insights || insights.aiActionCenter.items.length === 0 ? (
            <EmptyState variant="empty" message="No AI alerts — everything looks good." />
          ) : (
            <div className="flex flex-col gap-3">
              {insights.aiActionCenter.items.map((item) => {
                const Icon = SEVERITY_ICON[item.type] ?? AlertTriangle;
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 rounded-[12px] border border-[#c3c6d2]/40 bg-white p-3 transition-colors hover:bg-gray-50/50"
                  >
                    <Icon
                      className={`mt-0.5 h-5 w-5 shrink-0 ${
                        item.severity === "HIGH" ? "text-red-500" : item.severity === "MEDIUM" ? "text-amber-500" : "text-brand-muted"
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-brand-navy">{item.title}</p>
                        <StatusBadge label={item.severity} tone={SEVERITY_TONE[item.severity]} />
                      </div>
                      <p className="mt-0.5 text-xs text-brand-muted">{item.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Timesheet Status + Attendance Trends */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Timesheet Status */}
        <SectionCard
          title="Timesheet Status"
          action={
            <Link
              href="/admin/timesheets"
              className="flex items-center gap-1 text-sm font-medium text-brand hover:text-[#1467d6]"
            >
              View All <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !insights || insights.timesheetStatus.length === 0 ? (
            <EmptyState variant="empty" message="No timesheets to review." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                    <th className="py-2 pr-3">Employee</th>
                    <th className="py-2 pr-3">Department</th>
                    <th className="py-2 pr-3">Period</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">AI Flag</th>
                    <th className="py-2 pr-3">Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c3c6d2]/30">
                  {insights.timesheetStatus.slice(0, 10).map((ts) => (
                    <tr key={ts.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-2.5 pr-3 font-medium text-brand-navy whitespace-nowrap">{ts.employee}</td>
                      <td className="py-2.5 pr-3 text-brand-muted">{ts.department}</td>
                      <td className="py-2.5 pr-3 text-brand-ink whitespace-nowrap text-xs">{ts.period}</td>
                      <td className="py-2.5 pr-3">
                        <StatusBadge {...timesheetStatusTone(ts.status)} />
                      </td>
                      <td className="py-2.5 pr-3">
                        {ts.aiFlagged ? (
                          <span className="flex items-center gap-1 text-xs font-medium text-amber-600">
                            <AlertTriangle className="h-3.5 w-3.5" /> Flagged
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Clear
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={`text-xs font-medium ${
                            ts.validationResult === "Passed"
                              ? "text-emerald-600"
                              : ts.validationResult === "Overtime Warning"
                                ? "text-amber-600"
                                : "text-red-600"
                          }`}
                        >
                          {ts.validationResult}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* Attendance Trends */}
        <SectionCard
          title="Attendance Trends"
          action={<BarChart3 className="h-5 w-5 text-brand-muted" aria-hidden="true" />}
        >
          {isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-48 w-full" />
            </div>
          ) : !insights || insights.attendanceTrends.length === 0 ? (
            <EmptyState variant="empty" message="No attendance data available yet." />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={insights.attendanceTrends}>
                    <defs>
                      <linearGradient id="submissionGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="approvalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e2e3" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v: number) => `${v}%`} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid #e4e2e3", fontSize: 12 }}
                      formatter={(value) => [`${value}%`]}
                    />
                    <Area
                      type="monotone"
                      dataKey="submissionRate"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#submissionGrad)"
                      name="Submission Rate"
                    />
                    <Area
                      type="monotone"
                      dataKey="approvalRate"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#approvalGrad)"
                      name="Approval Rate"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-between border-t border-[#c3c6d2]/40 pt-3">
                <div className="flex items-center gap-4 text-xs text-brand-muted">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                    Submission
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    Approval
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  {insights.attendanceTrends.filter((t) => t.anomalies > 0).length > 0 ? (
                    <span className="flex items-center gap-1 text-amber-600 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {insights.attendanceTrends.filter((t) => t.anomalies > 0).length} week{insights.attendanceTrends.filter((t) => t.anomalies > 0).length > 1 ? "s" : ""} with anomalies
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-emerald-600 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" /> No anomalies detected
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Quick Shortcuts */}
      <SectionCard title="Quick Shortcuts">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {SHORTCUTS.map((shortcut) => (
            <Link
              key={shortcut.label}
              href={shortcut.route}
              className="flex items-center gap-3 rounded-[12px] border border-[#c3c6d2]/40 bg-white p-4 transition-colors hover:bg-[#f6f3f4] hover:border-brand/30"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-brand/10">
                <shortcut.icon className="h-5 w-5 text-brand" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-brand-navy">{shortcut.label}</p>
                <p className="text-xs text-brand-muted">{shortcut.description}</p>
              </div>
              <ExternalLink className="ml-auto h-4 w-4 text-brand-muted/50" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

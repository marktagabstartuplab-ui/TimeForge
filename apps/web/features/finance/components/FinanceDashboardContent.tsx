"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Wallet,
  Users,
  Clock,
  TrendingUp,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  FileText,
  FileSpreadsheet,
  Download,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  BarChart3,
  Building2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard } from "@/components/shared/SectionCard";
import { ErrorState } from "@/components/shared/ErrorState";
import { Toast, type ToastState } from "@/components/shared/Toast";
import {
  getFinanceDashboard,
  getFinancePayrollTrends,
  getFinanceActivity,
  getFinanceCompliance,
  getFinanceDepartments,
  exportFinanceDashboard,
  type TrendPeriod,
} from "../api/finance.service";

const PIE_COLORS = ["#0052cc", "#0ea5e9", "#0f172a", "#38bdf8", "#818cf8", "#f59e0b", "#10b981", "#ef4444"];

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHrs < 1) return `${Math.floor(diffMs / (1000 * 60))}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const activityIcons: Record<string, React.FC<{ className?: string }>> = {
  payroll_run: RefreshCw,
  report_generation: FileSpreadsheet,
  compliance_alert: AlertTriangle,
  employee_update: Users,
};

const activityColors: Record<string, string> = {
  payroll_run: "text-[#0052cc] bg-[#e6f0ff]",
  report_generation: "text-[#16a34a] bg-[#f0fdf4]",
  compliance_alert: "text-[#d97706] bg-[#fffbeb]",
  employee_update: "text-[#7c3aed] bg-[#f5f3ff]",
};

export function FinanceDashboardContent() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>("monthly");

  const { data: dashboard, isLoading: isDashLoading, isError: isDashError, refetch: refetchDash } = useQuery({
    queryKey: ["finance", "dashboard"],
    queryFn: getFinanceDashboard,
    refetchInterval: 60_000,
  });

  const { data: trends, isLoading: isTrendsLoading } = useQuery({
    queryKey: ["finance", "trends", trendPeriod],
    queryFn: () => getFinancePayrollTrends(trendPeriod),
    refetchInterval: 60_000,
  });

  const { data: activity, isLoading: isActivityLoading } = useQuery({
    queryKey: ["finance", "activity"],
    queryFn: getFinanceActivity,
    refetchInterval: 30_000,
  });

  const { data: compliance, isLoading: isComplianceLoading } = useQuery({
    queryKey: ["finance", "compliance"],
    queryFn: getFinanceCompliance,
    refetchInterval: 60_000,
  });

  const { data: departments, isLoading: isDeptLoading } = useQuery({
    queryKey: ["finance", "departments"],
    queryFn: getFinanceDepartments,
    refetchInterval: 60_000,
  });

  const exportMutation = useMutation({
    mutationFn: () => exportFinanceDashboard(),
    onSuccess: (res) => {
      setToast({ message: res.message || "Export queued. You will be notified when ready.", tone: "success" });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Export failed. Please try again.", tone: "error" });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Finance Dashboard</h1>
          <p className="text-sm text-brand-muted">Real-time overview of organizational payroll and finances</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchDash(); setToast({ message: "Dashboard refreshed.", tone: "success" }); }}>
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {isDashLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
              <Skeleton className="mb-2 h-[26px] w-[26px] rounded-[8px]" />
              <Skeleton className="mb-1 h-4 w-20" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))
        ) : isDashError ? (
          <div className="col-span-full">
            <ErrorState onRetry={refetchDash} />
          </div>
        ) : dashboard ? (
          <>
            <SummaryCard
              icon={Wallet}
              label="Total Payroll"
              value={formatCurrency(dashboard.totalPayroll.value)}
              trend={dashboard.totalPayroll.trend}
            />
            <SummaryCard
              icon={Users}
              label="Employees Ready"
              value={`${dashboard.employeesReady.value}`}
              subtitle={`of ${dashboard.employeesReady.total} total`}
            />
            <SummaryCard
              icon={Clock}
              label="Pending Payroll"
              value={`${dashboard.pendingPayroll.value}`}
            />
            <SummaryCard
              icon={TrendingUp}
              label="Payroll Completion"
              value={`${dashboard.payrollCompletion.value}%`}
              subtitle={`${dashboard.payrollCompletion.completed} of ${dashboard.payrollCompletion.total} periods`}
            />
            <SummaryCard
              icon={DollarSign}
              label="Estimated Cost"
              value={formatCurrency(dashboard.estimatedCost.value)}
            />
          </>
        ) : null}
      </div>

      {/* Payroll Trend Analysis + Department Allocation */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard
          title="Payroll Trend Analysis"
          className="lg:col-span-2"
          action={
            <div className="flex items-center gap-1 rounded-[8px] border border-[#c3c6d2]/50 p-0.5">
              {(["monthly", "quarterly", "yearly"] as TrendPeriod[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setTrendPeriod(p)}
                  className={cn(
                    "rounded-[6px] px-3 py-1 text-xs font-medium transition-colors",
                    trendPeriod === p
                      ? "bg-[#0052cc] text-white"
                      : "text-brand-muted hover:text-brand-navy",
                  )}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1, 3)}
                </button>
              ))}
            </div>
          }
        >
          {isTrendsLoading ? (
            <div className="flex h-[300px] items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <Skeleton className="h-[250px] w-full" />
              </div>
            </div>
          ) : trends && trends.trends.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends.trends}>
                  <defs>
                    <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0052cc" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#0052cc" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <RechartsTooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-2 text-sm shadow-sm">
                          <p className="font-medium text-brand-navy">{label}</p>
                          <p className="text-brand">{formatCurrency(Number(payload[0].value))}</p>
                        </div>
                      );
                    }}
                  />
                  <Area type="monotone" dataKey="totalPay" stroke="#0052cc" strokeWidth={2} fill="url(#trendGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-brand-muted">
              No trend data available yet. Generate a payroll period to see trends.
            </div>
          )}
        </SectionCard>

        <SectionCard title="Department Allocation">
          {isDeptLoading ? (
            <div className="flex h-[300px] items-center justify-center">
              <Skeleton className="h-[200px] w-[200px] rounded-full" />
            </div>
          ) : departments && departments.departments.length > 0 ? (
            <div className="flex flex-col items-center gap-4">
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={departments.departments}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="amount"
                      nameKey="name"
                    >
                      {departments.departments.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-2 text-sm shadow-sm">
                            <p className="font-medium text-brand-navy">{payload[0].name}</p>
                            <p className="text-brand">{formatCurrency(Number(payload[0].value))}</p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex w-full flex-col gap-1.5">
                {departments.departments.slice(0, 5).map((dept, idx) => (
                  <div key={dept.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                      <span className="text-brand-muted">{dept.name}</span>
                    </div>
                    <span className="font-medium text-brand-navy">{dept.percentage}%</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex w-full items-center justify-between border-t border-[#c3c6d2]/50 pt-3 text-sm">
                <span className="text-brand-muted">Total Spend</span>
                <span className="font-bold text-brand-navy">{formatCurrency(departments.totalSpend)}</span>
              </div>
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-brand-muted">
              No payroll data yet.
            </div>
          )}
        </SectionCard>
      </div>

      {/* Recent Activity + Compliance + Quick Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title="Recent Activity" className="lg:col-span-2">
          {isActivityLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-[8px]" />
                  <div className="flex-1">
                    <Skeleton className="mb-1 h-4 w-40" />
                    <Skeleton className="h-3 w-60" />
                  </div>
                </div>
              ))}
            </div>
          ) : activity && activity.items.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {activity.items.map((item) => {
                const Icon = activityIcons[item.type] ?? Activity;
                return (
                  <div key={item.id} className="flex items-start gap-3 rounded-[8px] p-2.5 transition-colors hover:bg-[#f6f3f4]">
                    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]", activityColors[item.type] ?? "text-brand-muted bg-[#f6f3f4]")}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-brand-navy">{item.title}</p>
                      <p className="truncate text-xs text-brand-muted">{item.description}</p>
                    </div>
                    <span className="shrink-0 text-xs text-brand-muted">{formatDate(item.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-sm text-brand-muted">
              No recent finance activity.
            </div>
          )}
        </SectionCard>

        <div className="flex flex-col gap-6">
          <SectionCard title="Compliance Status">
            {isComplianceLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-12 w-12 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
            ) : compliance ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-brand-muted">Last Scan</span>
                  <span className="font-medium text-brand-navy">
                    {compliance.lastScan ? formatDate(compliance.lastScan) : "Not scanned"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative flex h-14 w-14 items-center justify-center">
                    <svg className="h-14 w-14 -rotate-90" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                      <circle
                        cx="18" cy="18" r="15.5"
                        fill="none"
                        stroke={compliance.complianceScore >= 80 ? "#16a34a" : compliance.complianceScore >= 50 ? "#d97706" : "#ef4444"}
                        strokeWidth="3"
                        strokeDasharray={`${(compliance.complianceScore / 100) * 97.4} 97.4`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute text-sm font-bold">{compliance.complianceScore}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-navy">Compliance Score</p>
                    <div className="flex items-center gap-1">
                      {compliance.payrollHealth === "good" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#16a34a]" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-[#d97706]" />
                      )}
                      <span className={cn(
                        "text-xs font-medium",
                        compliance.payrollHealth === "good" ? "text-[#16a34a]" : "text-[#d97706]",
                      )}>
                        {compliance.payrollHealth === "good" ? "Good" : compliance.payrollHealth === "fair" ? "Fair" : "Poor"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 text-xs text-brand-muted">
                  <div className="flex justify-between">
                    <span>Exported Periods</span>
                    <span className="font-medium text-brand-navy">{compliance.metrics.exportedPeriods}/{compliance.metrics.totalPeriods}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Eligible Users</span>
                    <span className="font-medium text-brand-navy">{compliance.metrics.eligibleUsers}/{compliance.metrics.totalUsers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Payroll Ready Timesheets</span>
                    <span className="font-medium text-brand-navy">{compliance.metrics.payrollReadyTimesheets}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8 text-sm text-brand-muted">
                No compliance data.
              </div>
            )}
          </SectionCard>

          <SectionCard title="Quick Actions">
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={() => window.location.href = "/finance/payroll-processing"}
              >
                <FileText className="mr-2 h-4 w-4" />
                Generate Payroll
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={() => window.location.href = "/finance/reports"}
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                View Reports
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                disabled={exportMutation.isPending}
                onClick={() => exportMutation.mutate()}
              >
                {exportMutation.isPending ? (
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export Dashboard
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={() => window.location.href = "/finance/payroll-processing"}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Open Payroll Processing
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

// ─── Summary Card sub-component ──────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  trend,
  subtitle,
}: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  trend?: number;
  subtitle?: string;
}) {
  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-start justify-between">
        <Icon className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        {trend !== undefined ? (
          <span className={cn(
            "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold",
            trend >= 0 ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#fef2f2] text-[#dc2626]",
          )}>
            {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-base text-brand-muted">{label}</p>
      <p className="text-2xl font-bold text-brand-ink">{value}</p>
      {subtitle ? <p className="mt-0.5 text-xs text-brand-muted">{subtitle}</p> : null}
    </div>
  );
}

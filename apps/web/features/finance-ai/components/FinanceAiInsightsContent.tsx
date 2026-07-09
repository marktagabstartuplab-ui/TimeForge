"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Download,
  DollarSign,
  BarChart3,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  Sparkles,
  Eye,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Target,
  Zap,
  FileText,
  Building2,
  Activity,
  Play,
  Loader2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { SectionCard } from "@/components/shared/SectionCard";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { ErrorState } from "@/components/shared/ErrorState";
import {
  getAiDashboard,
  getAiAlerts,
  getAiForecast,
  getAiBudget,
  getAiLiability,
  generateAiReport,
  getAiReport,
  reviewAiAlert,
  type AiDashboardResponse,
  type AiAlertsResponse,
  type AiForecastResponse,
  type BudgetResponse,
  type AiAlert,
  type AiQuery,
  type AiReportResult,
} from "../api/finance-ai.service";
import { AiReportModal } from "./AiReportModal";

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `₱${(value / 1_000).toFixed(1)}K`;
  return `₱${value.toFixed(2)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHrs < 1) return `${Math.floor(diffMs / (1000 * 60))}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffHrs < 168) return `${Math.floor(diffHrs / 24)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const severityConfig: Record<string, { label: string; tone: BadgeTone }> = {
  HIGH: { label: "High", tone: "danger" },
  MEDIUM: { label: "Medium", tone: "warning" },
  LOW: { label: "Low", tone: "info" },
};

const budgetStatusConfig: Record<string, { label: string; tone: BadgeTone }> = {
  ON_TRACK: { label: "On Track", tone: "success" },
  AT_RISK: { label: "At Risk", tone: "warning" },
  OVER_BUDGET: { label: "Over Budget", tone: "danger" },
};

export function FinanceAiInsightsContent() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [forecastPeriod, setForecastPeriod] = useState<string>("monthly");
  const [alertSeverity, setAlertSeverity] = useState<string>("ALL");
  const [budgetSearch, setBudgetSearch] = useState("");
  const [alertCursor, setAlertCursor] = useState<string | null>(null);
  const [alertPage, setAlertPage] = useState(0);
  const [alertStack, setAlertStack] = useState<(string | null)[]>([null]);

  // ─── Card Report Generation State ──────────────────────────────────────────────
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [completedReport, setCompletedReport] = useState<AiReportResult | null>(null);
  const [loadingCard, setLoadingCard] = useState<string | null>(null);

  // ─── Queries ──────────────────────────────────────────────────────────────────

  const { data: dashboard, isLoading: isDashLoading, isError: isDashError, refetch: refetchDash } = useQuery({
    queryKey: ["finance-ai", "dashboard"],
    queryFn: () => getAiDashboard({}),
    refetchInterval: 60_000,
  });

  const { data: alerts, isLoading: isAlertsLoading, refetch: refetchAlerts } = useQuery({
    queryKey: ["finance-ai", "alerts", alertSeverity, alertCursor],
    queryFn: () => getAiAlerts({ severity: alertSeverity === "ALL" ? undefined : alertSeverity, cursor: alertCursor ?? undefined, limit: 10 }),
    refetchInterval: 30_000,
  });

  const { data: forecast, isLoading: isForecastLoading } = useQuery({
    queryKey: ["finance-ai", "forecast", forecastPeriod],
    queryFn: () => getAiForecast({ period: forecastPeriod }),
    refetchInterval: 120_000,
  });

  const { data: budget, isLoading: isBudgetLoading, refetch: refetchBudget } = useQuery({
    queryKey: ["finance-ai", "budget"],
    queryFn: () => getAiBudget({ search: budgetSearch || undefined }),
    refetchInterval: 120_000,
  });

  const { data: liability, isLoading: isLiabilityLoading } = useQuery({
    queryKey: ["finance-ai", "liability"],
    queryFn: getAiLiability,
    refetchInterval: 60_000,
  });

  // ─── Mutations ─────────────────────────────────────────────────────────────────

  const reportMutation = useMutation({
    mutationFn: generateAiReport,
    onSuccess: (res) => {
      setToast({ message: res.message || "AI report generation queued.", tone: "success" });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Report generation failed.", tone: "error" });
    },
  });

  const cardReportMutation = useMutation({
    mutationFn: (type: string) => generateAiReport(type),
    onSuccess: (res) => {
      setPendingJobId(res.jobId);
      setToast({ message: res.message || "AI report generation started.", tone: "success" });
    },
    onError: (err: Error) => {
      setLoadingCard(null);
      setToast({ message: err.message || "Report generation failed.", tone: "error" });
    },
  });

  const pollStartRef = useRef<number | null>(null);
  const POLL_TIMEOUT_MS = 120_000;

  useEffect(() => {
    if (pendingJobId) pollStartRef.current = Date.now();
    if (!pendingJobId) pollStartRef.current = null;
  }, [pendingJobId]);

  useQuery({
    queryKey: ["finance-ai", "report-poll", pendingJobId],
    queryFn: async () => {
      try {
        const result = await getAiReport(pendingJobId!);
        if (result.status === "SUCCEEDED" || result.status === "FAILED") {
          setLoadingCard(null);
          setPendingJobId(null);
          setCompletedReport(result);
          setReportModalOpen(true);
        }
        return result;
      } catch {
        // Job not yet created by worker — keep polling
        return null;
      }
    },
    enabled: !!pendingJobId,
    refetchInterval: (query) => {
      if (pollStartRef.current && Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        setLoadingCard(null);
        setPendingJobId(null);
        setToast({ message: "Report generation timed out. Please try again.", tone: "error" });
        return false;
      }
      const status = query.state.data?.status;
      if (status === "SUCCEEDED" || status === "FAILED") return false;
      return 2000;
    },
  });

  const handleGenerateCardReport = (type: string) => {
    setLoadingCard(type);
    setCompletedReport(null);
    cardReportMutation.mutate(type);
  };

  const handleCloseReportModal = () => {
    setReportModalOpen(false);
    setCompletedReport(null);
  };

  const reviewMutation = useMutation({
    mutationFn: reviewAiAlert,
    onSuccess: () => {
      setToast({ message: "Alert reviewed.", tone: "success" });
      refetchAlerts();
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Review failed.", tone: "error" });
    },
  });

  const handleAlertNext = () => {
    if (alerts?.page.nextCursor) {
      const next = alerts.page.nextCursor;
      setAlertStack((prev) => [...prev, next]);
      setAlertPage((prev) => prev + 1);
      setAlertCursor(next);
    }
  };

  const handleAlertPrev = () => {
    if (alertPage > 0) {
      const newPage = alertPage - 1;
      setAlertPage(newPage);
      setAlertCursor(alertStack[newPage]);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Finance AI Insights</h1>
          <p className="text-sm text-brand-muted">AI-powered payroll analysis, forecasting, and financial intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetchDash(); setToast({ message: "Dashboard refreshed.", tone: "success" }); }}>
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Refresh</span>
          </Button>
          <Button variant="default" size="sm" onClick={() => reportMutation.mutate(undefined)} disabled={reportMutation.isPending}>
            {reportMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="hidden sm:inline ml-1">Generate AI Report</span>
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {isDashLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
              <Skeleton className="mb-2 h-[26px] w-[26px] rounded-[8px]" />
              <Skeleton className="mb-1 h-4 w-20" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="mt-1 h-3 w-16" />
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
              label="Payroll Liability"
              value={formatCurrency(dashboard.summaryCards.payrollLiability.value)}
              change={dashboard.summaryCards.payrollLiability.change}
            />
            <SummaryCard
              icon={Target}
              label="Budget Variance"
              value={`${dashboard.summaryCards.budgetVariance.value >= 0 ? "+" : ""}${dashboard.summaryCards.budgetVariance.value}%`}
              change={dashboard.summaryCards.budgetVariance.change}
            />
            <SummaryCard
              icon={Zap}
              label="AI Efficiency Gain"
              value={`${dashboard.summaryCards.aiEfficiencyGain.value}%`}
              change={dashboard.summaryCards.aiEfficiencyGain.change}
            />
          </>
        ) : null}
      </div>

      {/* Payroll Oversight Hub + Validation Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard title="Payroll Oversight Hub" className="lg:col-span-2">
          {isDashLoading ? (
            <div className="grid grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-[12px]" />
              ))}
            </div>
          ) : dashboard ? (
            <div className="grid grid-cols-5 gap-3">
              <OversightItem label="Pending Approvals" value={dashboard.payrollOversight.pendingApprovals} icon={Clock} color="text-amber-600 bg-amber-50" />
              <OversightItem label="Active Cycles" value={dashboard.payrollOversight.activeCycles} icon={Activity} color="text-blue-600 bg-blue-50" />
              <OversightItem label="AI Validation" value={`${dashboard.payrollOversight.aiValidationStatus}%`} icon={Shield} color="text-emerald-600 bg-emerald-50" />
              <OversightItem label="Processing Health" value={`${dashboard.payrollOversight.processingHealth}%`} icon={BarChart3} color="text-violet-600 bg-violet-50" />
              <OversightItem label="Compliance Status" value={`${dashboard.payrollOversight.complianceStatus}%`} icon={CheckCircle2} color="text-cyan-600 bg-cyan-50" />
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Payroll Validation Flow">
          <div className="flex flex-col gap-4">
            <StageRow name="1. Timesheets" status="completed" progress={100} duration="2.4s" />
            <StageRow name="2. Validation" status={dashboard?.payrollOversight.processingHealth ?? 0 >= 80 ? "completed" : "in-progress"} progress={dashboard?.payrollOversight.processingHealth ?? 0} duration="1.8s" />
            <StageRow name="3. Payroll Calculation" status={(dashboard?.payrollOversight.pendingApprovals ?? 0) > 0 ? "pending" : "in-progress"} progress={(dashboard?.payrollOversight.pendingApprovals ?? 0) > 0 ? 85 : 45} duration="0s" />
            <StageRow name="4. Payroll Processing" status="pending" progress={0} duration="—" />
          </div>
        </SectionCard>
      </div>

      {/* AI Action Center */}
      <SectionCard
        title="AI Action Center"
        action={
          <div className="flex items-center gap-1 rounded-[8px] border border-[#c3c6d2]/50 p-0.5">
            <button
              type="button"
              onClick={() => { setAlertSeverity("ALL"); setAlertStack([null]); setAlertPage(0); setAlertCursor(null); }}
              className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", alertSeverity === "ALL" ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}
            >All</button>
            <button
              type="button"
              onClick={() => { setAlertSeverity("HIGH"); setAlertStack([null]); setAlertPage(0); setAlertCursor(null); }}
              className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", alertSeverity === "HIGH" ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}
            >High</button>
            <button
              type="button"
              onClick={() => { setAlertSeverity("MEDIUM"); setAlertStack([null]); setAlertPage(0); setAlertCursor(null); }}
              className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", alertSeverity === "MEDIUM" ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}
            >Medium</button>
            <button
              type="button"
              onClick={() => { setAlertSeverity("LOW"); setAlertStack([null]); setAlertPage(0); setAlertCursor(null); }}
              className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", alertSeverity === "LOW" ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}
            >Low</button>
          </div>
        }
      >
        {isAlertsLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-[8px]" />
                <div className="flex-1"><Skeleton className="mb-1 h-4 w-40" /><Skeleton className="h-3 w-60" /></div>
              </div>
            ))}
          </div>
        ) : alerts && alerts.data.length > 0 ? (
          <div className="flex flex-col gap-2">
            {alerts.data.map((alert) => {
              const sevCfg = severityConfig[alert.severity] ?? { label: alert.severity, tone: "neutral" as BadgeTone };
              return (
                <div key={alert.id} className="flex items-start gap-3 rounded-[8px] border border-[#c3c6d2]/30 p-3 transition-colors hover:bg-[#f6f3f4]">
                  <div className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]",
                    alert.severity === "HIGH" ? "bg-red-50 text-red-600" : alert.severity === "MEDIUM" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600",
                  )}>
                    {alert.type === "COMPLIANCE_RISK" ? <Shield className="h-4 w-4" /> :
                     alert.type === "OVERTIME_ANOMALY" ? <Clock className="h-4 w-4" /> :
                     alert.type === "BUDGET_THRESHOLD" ? <DollarSign className="h-4 w-4" /> :
                     alert.type === "PAYROLL_ERROR" ? <AlertTriangle className="h-4 w-4" /> :
                     <Sparkles className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-brand-navy">{alert.title}</p>
                      <StatusBadge label={sevCfg.label} tone={sevCfg.tone} />
                    </div>
                    <p className="mt-0.5 text-xs text-brand-muted">{alert.message}</p>
                    {alert.department && <p className="mt-0.5 text-xs text-brand-muted">Department: {alert.department}</p>}
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-xs text-brand-muted">{formatDate(alert.timestamp)}</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-brand" onClick={() => reviewMutation.mutate(alert.id)} disabled={reviewMutation.isPending}>
                        <Eye className="h-3 w-3 mr-1" /> Review
                      </Button>
                    </div>
                    <p className="mt-1 text-xs italic text-brand-muted">{alert.recommendation}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-brand-muted">
            No AI alerts at this time. All metrics are within normal range.
          </div>
        )}

        {/* Alert Pagination */}
        {alerts && alerts.data.length > 0 && (
          <div className="flex items-center justify-between pt-3 border-t border-[#c3c6d2]/30">
            <span className="text-xs text-brand-muted">Showing {alerts.data.length} alerts</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={alertPage === 0} onClick={handleAlertPrev} className="h-8 text-xs px-3">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="outline" disabled={!alerts.page.nextCursor} onClick={handleAlertNext} className="h-8 text-xs px-3">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Financial Reporting Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard
          title="Labor Cost Trend"
          action={
            <div className="flex items-center gap-1 rounded-[8px] border border-[#c3c6d2]/50 p-0.5">
              {["monthly", "quarterly", "yearly"].map((p) => (
                <button key={p} type="button" onClick={() => setForecastPeriod(p)}
                  className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", forecastPeriod === p ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}
                >{p.charAt(0).toUpperCase() + p.slice(1, 3)}</button>
              ))}
            </div>
          }
        >
          {isForecastLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : forecast && forecast.laborCostForecast.length > 0 ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecast.laborCostForecast}>
                  <defs>
                    <linearGradient id="laborGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0052cc" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#0052cc" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" tickFormatter={(v) => `₱${(v / 1000000).toFixed(1)}M`} />
                  <RechartsTooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return <div className="rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-2 text-sm shadow-sm"><p className="font-medium text-brand-navy">{label}</p><p className="text-brand">{formatCurrency(Number(payload[0].value))}</p></div>;
                  }} />
                  <Area type="monotone" dataKey="value" stroke="#0052cc" strokeWidth={2} fill="url(#laborGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-brand-muted">No labor cost data available.</div>
          )}
        </SectionCard>

        <SectionCard
          title="Payroll Trend"
          action={
            <div className="flex items-center gap-1 rounded-[8px] border border-[#c3c6d2]/50 p-0.5">
              {["monthly", "quarterly", "yearly"].map((p) => (
                <button key={p} type="button" onClick={() => setForecastPeriod(p)}
                  className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", forecastPeriod === p ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}
                >{p.charAt(0).toUpperCase() + p.slice(1, 3)}</button>
              ))}
            </div>
          }
        >
          {isForecastLoading ? (
            <Skeleton className="h-[280px] w-full" />
          ) : forecast && forecast.payrollForecast.length > 0 ? (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={forecast.payrollForecast}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" tickFormatter={(v) => `₱${(v / 1000000).toFixed(1)}M`} />
                  <RechartsTooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return <div className="rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-2 text-sm shadow-sm"><p className="font-medium text-brand-navy">{label}</p><p className="text-brand">{formatCurrency(Number(payload[0].value))}</p></div>;
                  }} />
                  <Bar dataKey="value" fill="#0052cc" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-brand-muted">No payroll trend data available.</div>
          )}
        </SectionCard>
      </div>

      {/* Liability + Budget Utilization + Cash Flow */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SectionCard title="Financial Exposure">
          {isLiabilityLoading ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : liability ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between py-2 border-b border-[#c3c6d2]/20">
                <span className="text-sm text-brand-muted">Payroll Liability</span>
                <span className="text-sm font-bold text-brand-navy">{formatCurrency(liability.payrollLiability)}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#c3c6d2]/20">
                <span className="text-sm text-brand-muted">Outstanding Payroll</span>
                <span className="text-sm font-bold text-amber-600">{formatCurrency(liability.outstandingPayroll)}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-[#c3c6d2]/20">
                <span className="text-sm text-brand-muted">Estimated Cost</span>
                <span className="text-sm font-bold text-brand-navy">{formatCurrency(liability.estimatedCost)}</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm font-medium text-brand-navy">Total Financial Exposure</span>
                <span className="text-sm font-bold text-red-600">{formatCurrency(liability.financialExposure)}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-sm text-brand-muted">No liability data.</div>
          )}
        </SectionCard>

        <SectionCard title="Budget Utilization">
          {isForecastLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : forecast && forecast.budgetProjection.length > 0 ? (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecast.budgetProjection}>
                  <defs>
                    <linearGradient id="budgetGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis hide />
                  <RechartsTooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return <div className="rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-2 text-sm shadow-sm"><p className="font-medium text-brand-navy">{label}</p><p className="text-emerald-600">{formatCurrency(Number(payload[0].value))}</p></div>;
                  }} />
                  <Area type="monotone" dataKey="value" stroke="#10b981" strokeWidth={2} fill="url(#budgetGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-brand-muted">No budget data.</div>
          )}
        </SectionCard>

        <SectionCard title="Cash Flow Forecast">
          {isForecastLoading ? (
            <Skeleton className="h-[200px] w-full" />
          ) : forecast && forecast.cashFlowForecast.length > 0 ? (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecast.cashFlowForecast}>
                  <defs>
                    <linearGradient id="cashGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#9ca3af" />
                  <YAxis hide />
                  <RechartsTooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return <div className="rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-2 text-sm shadow-sm"><p className="font-medium text-brand-navy">{label}</p><p className="text-amber-600">{formatCurrency(Number(payload[0].value))}</p></div>;
                  }} />
                  <Area type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} fill="url(#cashGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[200px] items-center justify-center text-sm text-brand-muted">No cash flow data.</div>
          )}
        </SectionCard>
      </div>

      {/* Department Budget Allocation */}
      <SectionCard
        title="Department Budget Allocation"
        action={
          <div className="flex items-center gap-2 border border-[#c3c6d2] rounded-lg px-2 py-1 bg-white">
            <Search className="h-3.5 w-3.5 text-brand-muted" />
            <input
              type="text"
              placeholder="Search department..."
              className="bg-transparent text-xs text-brand-navy outline-none border-none w-28"
              value={budgetSearch}
              onChange={(e) => { setBudgetSearch(e.target.value); }}
            />
          </div>
        }
      >
        {isBudgetLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : budget && budget.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Budget</th>
                  <th className="py-3 px-4">Amount Spent</th>
                  <th className="py-3 px-4">Remaining</th>
                  <th className="py-3 px-4">Utilization</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/30">
                {budget.data.map((row) => {
                  const cfg = budgetStatusConfig[row.status] ?? { label: row.status, tone: "neutral" as BadgeTone };
                  return (
                    <tr key={row.departmentId} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="py-3 px-4 font-semibold text-brand-navy">{row.department}</td>
                      <td className="py-3 px-4 text-brand-muted">{formatCurrency(row.budget)}</td>
                      <td className="py-3 px-4 text-brand-muted">{formatCurrency(row.spent)}</td>
                      <td className="py-3 px-4 font-semibold">{formatCurrency(row.remaining)}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 max-w-[120px]">
                          <ProgressBar percent={row.utilization} className="h-1.5" barClassName={row.status === "OVER_BUDGET" ? "bg-red-500" : row.status === "AT_RISK" ? "bg-amber-500" : "bg-emerald-500"} />
                          <span className="text-xs font-medium text-brand-muted">{row.utilization}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge label={cfg.label} tone={cfg.tone} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-brand-muted">No department budget data available.</div>
        )}

        {budget && (
          <div className="flex items-center justify-between border-t border-[#c3c6d2]/30 pt-4 mt-2">
            <span className="text-xs text-brand-muted">
              Total Budget: {formatCurrency(budget.totals.totalBudget)} · Spent: {formatCurrency(budget.totals.totalSpent)} · Remaining: {formatCurrency(budget.totals.totalRemaining)}
            </span>
            <span className="text-xs text-brand-muted">{budget.total} departments</span>
          </div>
        )}
      </SectionCard>

      {/* AI Recommendations */}
      {dashboard && (
        <SectionCard title="AI Recommendations">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <RecommendationCard
              title="Cost Optimization"
              description={dashboard.summaryCards.payrollLiability.value > 0
                ? `Payroll liability is ${formatCurrency(dashboard.summaryCards.payrollLiability.value)}. Review department budgets for optimization opportunities.`
                : "No cost optimization opportunities identified at this time."}
              priority="High"
              confidence={85}
              impact={dashboard.summaryCards.payrollLiability.value}
              action="View Financial Report"
              onAction={() => handleGenerateCardReport("cost_optimization")}
              isActionLoading={loadingCard === "cost_optimization"}
            />
            <RecommendationCard
              title="Payroll Risk Assessment"
              description={dashboard.payrollOversight.pendingApprovals > 5
                ? `${dashboard.payrollOversight.pendingApprovals} pending approvals require attention. Delayed approvals may impact payroll deadlines.`
                : "Payroll risk is low. Pending approvals are within acceptable range."}
              priority={dashboard.payrollOversight.pendingApprovals > 5 ? "High" : "Low"}
              confidence={90}
              impact={dashboard.payrollOversight.pendingApprovals * 1000}
              action="Review Approvals"
              onAction={() => handleGenerateCardReport("payroll_risk")}
              isActionLoading={loadingCard === "payroll_risk"}
            />
            <RecommendationCard
              title="Compliance Suggestion"
              description={dashboard.payrollOversight.complianceStatus < 80
                ? `Compliance score is ${dashboard.payrollOversight.complianceStatus}%. Review rejected timesheets and address recurring issues.`
                : `Compliance score is ${dashboard.payrollOversight.complianceStatus}%. Maintaining good compliance practices.`}
              priority={dashboard.payrollOversight.complianceStatus < 80 ? "Medium" : "Low"}
              confidence={95}
              impact={0}
              action="View Compliance"
              onAction={() => handleGenerateCardReport("compliance")}
              isActionLoading={loadingCard === "compliance"}
            />
            <RecommendationCard
              title="Financial Forecast"
              description={forecast && forecast.payrollForecast.length > 0
                ? `Projected payroll trend shows ${forecastPeriod} pattern. Plan budget allocation accordingly.`
                : "Generate payroll data to enable financial forecasting."}
              priority="Medium"
              confidence={75}
              impact={0}
              action="View Forecast"
              onAction={() => handleGenerateCardReport("forecast")}
              isActionLoading={loadingCard === "forecast"}
            />
            <RecommendationCard
              title="Staffing Recommendation"
              description={dashboard.payrollOversight.activeCycles > 3
                ? `${dashboard.payrollOversight.activeCycles} active payroll cycles indicate high processing volume. Consider automation improvements.`
                : "Current staffing levels align with payroll processing demands."}
              priority="Low"
              confidence={70}
              impact={0}
              action="View Reports"
              onAction={() => handleGenerateCardReport("staffing")}
              isActionLoading={loadingCard === "staffing"}
            />
            <RecommendationCard
              title="Budget Alert"
              description={dashboard.summaryCards.budgetVariance.value < -10
                ? `Budget variance is ${dashboard.summaryCards.budgetVariance.value}%. Spending exceeds projections. Review department allocations.`
                : "Budget is within expected variance range."}
              priority={dashboard.summaryCards.budgetVariance.value < -10 ? "High" : "Low"}
              confidence={80}
              impact={Math.abs(dashboard.summaryCards.budgetVariance.value) * 1000}
              action="View Budget"
              onAction={() => handleGenerateCardReport("budget")}
              isActionLoading={loadingCard === "budget"}
            />
          </div>
        </SectionCard>
      )}

      <AiReportModal
        open={reportModalOpen}
        onClose={handleCloseReportModal}
        report={completedReport}
        isLoading={cardReportMutation.isPending}
      />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, change }: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  change: number;
}) {
  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-start justify-between">
        <Icon className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <span className={cn(
          "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold",
          change >= 0 ? "bg-[#f0fdf4] text-[#16a34a]" : "bg-[#fef2f2] text-[#dc2626]",
        )}>
          {change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(change).toFixed(1)}%
        </span>
      </div>
      <p className="mt-2 text-xs text-brand-muted font-semibold">{label}</p>
      <p className="mt-1 text-2xl font-bold text-brand-ink">{value}</p>
    </div>
  );
}

function OversightItem({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: React.FC<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[12px] bg-[#f6f3f4] p-3 text-center">
      <div className={cn("flex h-8 w-8 items-center justify-center rounded-[8px]", color)}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-lg font-bold text-brand-navy">{value}</span>
      <span className="text-[10px] text-brand-muted font-semibold uppercase tracking-wider whitespace-nowrap">{label}</span>
    </div>
  );
}

function StageRow({ name, status, progress, duration }: {
  name: string;
  status: "completed" | "in-progress" | "pending";
  progress: number;
  duration: string;
}) {
  const StatusIcon = status === "completed" ? CheckCircle2 : status === "in-progress" ? Loader2 : Clock;
  const statusColor = status === "completed" ? "text-emerald-600" : status === "in-progress" ? "text-brand" : "text-brand-muted";

  return (
    <div className="flex items-center gap-3">
      <StatusIcon className={cn("h-5 w-5 shrink-0", statusColor, status === "in-progress" && "animate-spin")} />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className={cn("text-sm font-medium", status === "pending" ? "text-brand-muted" : "text-brand-navy")}>{name}</span>
          <span className="text-xs text-brand-muted">{duration}</span>
        </div>
        <ProgressBar percent={progress} className="mt-1 h-1" barClassName={status === "completed" ? "bg-emerald-500" : status === "in-progress" ? "bg-brand" : "bg-[#e4e2e3]"} />
      </div>
    </div>
  );
}

function RecommendationCard({ title, description, priority, confidence, impact, action, onAction, isActionLoading }: {
  title: string;
  description: string;
  priority: string;
  confidence: number;
  impact: number;
  action: string;
  onAction?: () => void;
  isActionLoading?: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-[#c3c6d2]/40 bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-bold text-brand-navy">{title}</h4>
        <StatusBadge label={priority} tone={priority === "High" ? "danger" : priority === "Medium" ? "warning" : "info"} />
      </div>
      <p className="text-xs text-brand-muted leading-relaxed mb-3">{description}</p>
      <div className="flex items-center justify-between text-xs text-brand-muted mb-3">
        <span>Confidence: {confidence}%</span>
        {impact > 0 && <span>Impact: {formatCurrency(impact)}</span>}
      </div>
      <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={onAction} disabled={isActionLoading}>
        {isActionLoading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
        {isActionLoading ? "Generating..." : action}
      </Button>
    </div>
  );
}

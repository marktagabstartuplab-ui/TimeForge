"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Download,
  Search,
  Zap,
  Calendar,
  CheckSquare,
  AlertTriangle,
  Sparkles,
  PieChart,
  Target,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { SectionCard } from "@/components/shared/SectionCard";
import {
  getPerformanceDashboard,
  getPerformanceOverview,
  getPerformanceMetrics,
  getPerformanceKpis,
  getPerformanceHistory,
  getPerformanceCoach,
  queuePerformanceExport
} from "../api/performance.service";
import { getMyKpiSummary } from "../api/kpi.service";
import { useAuth } from "@/providers/auth-provider";
import { useCan } from "@/features/auth/rbac";
import { AiRecapCard } from "./AiRecapCard";

function kpiStatusColor(status: "MET" | "ON_TRACK" | "BELOW"): string {
  if (status === "MET") return "text-emerald-600";
  if (status === "ON_TRACK") return "text-[#0052cc]";
  return "text-red-500";
}

function kpiStatusLabel(status: "MET" | "ON_TRACK" | "BELOW"): string {
  if (status === "MET") return "Met";
  if (status === "ON_TRACK") return "On Track";
  return "Below Target";
}

function metricLabel(type: string, unit: string | null): string {
  if (unit) return unit;
  if (type === "HOURS") return "hrs";
  if (type === "PERCENT") return "%";
  if (type === "CURRENCY") return "₱";
  return "";
}

export function PerformanceOversightContent() {
  const { user } = useAuth();
  // Only roles that can see other employees' performance (Admin/HR/Supervisor)
  // benefit from a search box — a regular employee only ever sees their own
  // data, so the field would be dead clutter with nothing to search for.
  const canSearchOthers = user?.roles.some((r) => r === "ADMIN" || r === "HR" || r === "SUPERVISOR") ?? false;
  // AI Work Recap triggers OWN-scope features (ai:trigger_self). HR/Finance can
  // reach this page (dashboard:read_self) but lack that permission, so gate the
  // card to avoid showing a button that would 403 on click.
  const canTriggerOwnAi = useCan("ai:trigger_self");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState("Last 7 Days");

  const queryParams = {
    userId: search || undefined,
  };

  // Queries
  const { data: dashboard, isLoading: isDashLoading, refetch: refetchDash } = useQuery({
    queryKey: ["perf", "dashboard", queryParams],
    queryFn: () => getPerformanceDashboard(queryParams),
  });

  const { data: overview = [], isLoading: isOverviewLoading } = useQuery({
    queryKey: ["perf", "overview", queryParams],
    queryFn: () => getPerformanceOverview(queryParams),
  });

  const { data: metrics, isLoading: isMetricsLoading } = useQuery({
    queryKey: ["perf", "metrics", queryParams],
    queryFn: () => getPerformanceMetrics(queryParams),
  });

  const { data: kpiRows = [], isLoading: isKpisLoading } = useQuery({
    queryKey: ["perf", "kpis", queryParams],
    queryFn: () => getPerformanceKpis(queryParams),
  });

  // Historical KPI trends (real data, not placeholder)
  const { data: history = [], isLoading: isHistoryLoading } = useQuery({
    queryKey: ["perf", "history", queryParams],
    queryFn: () => getPerformanceHistory({ ...queryParams, granularity: "weekly" }),
  });

  const { data: coach, isLoading: isCoachLoading } = useQuery({
    queryKey: ["perf", "coach", queryParams],
    queryFn: () => getPerformanceCoach(queryParams),
  });

  // My KPI Summary (for the target-vs-actual section)
  const { data: myKpis = [], isLoading: isMyKpisLoading } = useQuery({
    queryKey: ["perf", "my-kpis"],
    queryFn: getMyKpiSummary,
    // only fetch if viewing own performance (no userId search)
    enabled: !search,
  });

  // Export Mutation
  const exportMutation = useMutation({
    mutationFn: (format: "CSV" | "XLSX" | "PDF") => queuePerformanceExport({ format, ...queryParams }),
    onSuccess: (data) => {
      setToast({ message: `Export job ${data.jobId} queued successfully. Check notification center soon.`, tone: "success" });
    },
    onError: (err: any) => {
      setToast({ message: err?.message || "Export failed.", tone: "error" });
    }
  });

  const handleRefresh = () => {
    refetchDash();
    setToast({ message: "Performance metrics refreshed.", tone: "success" });
  };

  // Show real data; if 0, display 0% (not fake fallbacks)
  const scoreValue = dashboard?.summaryBanner.score ?? 0;
  const isDashReady = !isDashLoading;

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Top Header Row */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-[#c3c6d2]/30 pb-4">
        <h1 className="text-[28px] font-bold text-brand-navy font-sans tracking-tight">Performance Insights</h1>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <div className="border border-[#c3c6d2] rounded-lg px-2.5 py-1 text-xs font-semibold bg-white flex items-center gap-1.5 cursor-pointer">
            <span className="text-brand-muted">Period:</span>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="bg-transparent font-bold text-brand-navy outline-none border-none cursor-pointer"
            >
              <option value="Last 7 Days">Last 7 Days</option>
              <option value="Last 30 Days">Last 30 Days</option>
              <option value="This Quarter">This Quarter</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {canSearchOthers ? (
            <div className="relative w-60">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-brand-muted" />
              <Input
                placeholder="Search Employee ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8.5 text-xs"
              />
            </div>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="h-8.5 text-xs font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>

          <div className="flex items-center gap-1 border border-[#c3c6d2] rounded-lg p-0.5 bg-white">
            <Button variant="ghost" size="sm" onClick={() => exportMutation.mutate("CSV")} className="h-7 text-[10px] font-bold">CSV</Button>
            <Button variant="ghost" size="sm" onClick={() => exportMutation.mutate("XLSX")} className="h-7 text-[10px] font-bold">EXCEL</Button>
            <Button variant="ghost" size="sm" onClick={() => exportMutation.mutate("PDF")} className="h-7 text-[10px] font-bold">PDF</Button>
          </div>
        </div>
      </div>

      {/* Banner Card */}
      {isDashLoading ? (
        <div className="h-32 flex items-center justify-center rounded-2xl border border-[#c3c6d2]/50">
          <Loader2 className="h-6 w-6 animate-spin text-brand" />
        </div>
      ) : (
        <div className={cn(
          "rounded-2xl border p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-[0px_2px_4px_rgba(0,0,0,0.02)]",
          scoreValue < 50 ? "border-red-200 bg-red-50/5" : "border-emerald-200 bg-emerald-50/5"
        )}>
          <div className="flex items-start gap-4">
            <div className={cn(
              "p-3 rounded-xl shrink-0",
              scoreValue < 50 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
            )}>
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                  scoreValue < 50 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                )}>
                  {dashboard?.summaryBanner.rating ?? "No Data"}
                </span>
                <span className="text-xs text-brand-muted font-medium">Score: {scoreValue}% Target</span>
              </div>
              <p className="text-sm font-semibold text-brand-navy mt-1.5 leading-snug">
                {scoreValue === 0
                  ? "No KPI data yet — approve timesheets to start tracking"
                  : scoreValue < 50
                  ? "Critical performance issues, urgent intervention required"
                  : "Strong contributor, performing above standard expectations"
                }
              </p>
            </div>
          </div>

          <div className="flex items-baseline gap-2 border-r border-[#c3c6d2]/30 pr-8">
            <span className="text-[44px] font-extrabold text-brand-navy tracking-tighter leading-none">
              {scoreValue}
            </span>
            <div className="text-[10px] font-bold text-brand-muted uppercase leading-tight">
              PERFORMANCE<br/>SCORE<br/>
              <span className="text-[9px] font-medium text-brand-muted/70 lowercase">out of 100</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-6 text-center">
            <div>
              <div className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">TIME PERIOD</div>
              <div className="text-sm font-bold text-brand-navy mt-1">Weekly</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">METRICS TRACKED</div>
              <div className="text-sm font-bold text-brand-navy mt-1">{dashboard?.summaryBanner.kpisTracked ?? 0} KPIs</div>
            </div>
            <div>
              <div className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">STATUS</div>
              <div className="text-sm font-bold text-brand-navy mt-1">
                {dashboard?.summaryBanner.status ?? "No Data"}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats Cards Row — real data, no hardcoded fallbacks */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Efficiency */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Efficiency Score</span>
            <div className="text-3xl font-extrabold text-brand-navy mt-1.5">
              {isDashLoading ? "—" : (dashboard?.summaryCards.efficiency.value ?? "0%")}
            </div>
            <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-[#15803d]">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>{dashboard?.summaryCards.efficiency.change ?? "—"}</span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-sky-50 text-[#0052cc] flex items-center justify-center">
            <Zap className="h-5 w-5 fill-current" />
          </div>
        </div>

        {/* Attendance */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Attendance Rate</span>
            <div className="text-3xl font-extrabold text-brand-navy mt-1.5">
              {isDashLoading ? "—" : (dashboard?.summaryCards.attendance.value ?? "0%")}
            </div>
            <div className="text-xs font-semibold text-brand-muted mt-2">
              {dashboard?.summaryCards.attendance.change ?? "—"}
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-emerald-50 text-[#15803d] flex items-center justify-center">
            <Calendar className="h-5 w-5" />
          </div>
        </div>

        {/* Task Completion */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] flex items-center justify-between">
          <div className="flex-1 mr-4">
            <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Task Completion</span>
            <div className="text-3xl font-extrabold text-brand-navy mt-1.5">
              {isDashLoading ? "—" : (dashboard?.summaryCards.taskCompletion.value ?? "0/0")}
            </div>
            <div className="mt-2.5">
              <ProgressBar
                percent={
                  dashboard?.summaryCards.taskCompletion.total
                    ? Math.round((dashboard.summaryCards.taskCompletion.completed / dashboard.summaryCards.taskCompletion.total) * 100)
                    : 0
                }
                className="h-1.5"
              />
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <CheckSquare className="h-5 w-5" />
          </div>
        </div>

        {/* KPI Score */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Overall KPI Score</span>
            <div className="text-3xl font-extrabold text-brand-navy mt-1.5">
              {isDashLoading ? "—" : (dashboard?.summaryCards.kpiScore.value ?? "0%")}
            </div>
            <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-[#15803d]">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>{dashboard?.summaryCards.kpiScore.change ?? "—"}</span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center">
            <PieChart className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* AI Work Recap — wires DAILY_SUMMARY / WEEKLY_SUMMARY (own data only) */}
      {!search && user?.id && canTriggerOwnAi ? <AiRecapCard userId={user.id} /> : null}

      {/* My KPIs — Target vs Actual (KPI-05, KPI-06) */}
      {!search && (
        <SectionCard title="My KPIs — Target vs Actual">
          <p className="text-xs text-brand-muted -mt-4 mb-4">
            Current period progress against your configured KPI targets.
          </p>

          {isMyKpisLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : myKpis.length === 0 ? (
            <div className="text-center py-8 text-xs text-brand-muted">
              No KPI templates configured for your organization yet. Ask your admin to set up KPI metrics.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                    <th className="py-3 px-3">KPI Metric</th>
                    <th className="py-3 px-3">Type</th>
                    <th className="py-3 px-3">Period</th>
                    <th className="py-3 px-3">Actual</th>
                    <th className="py-3 px-3">Target</th>
                    <th className="py-3 px-3">Progress</th>
                    <th className="py-3 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c3c6d2]/25">
                  {myKpis.map((kpi) => (
                    <tr key={kpi.kpiTemplateId} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <Target className="h-4 w-4 text-brand shrink-0" />
                          <div>
                            <p className="font-semibold text-brand-navy">{kpi.name}</p>
                            {kpi.description && <p className="text-xs text-brand-muted truncate max-w-[160px]">{kpi.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-brand/10 text-brand">
                          {kpi.metricType}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-brand-muted">{kpi.period}</td>
                      <td className="py-3 px-3 font-bold text-brand-navy">
                        {kpi.current} {metricLabel(kpi.metricType, kpi.unit)}
                      </td>
                      <td className="py-3 px-3 text-brand-muted">
                        {kpi.target} {metricLabel(kpi.metricType, kpi.unit)}
                      </td>
                      <td className="py-3 px-3 w-32">
                        <div className="flex items-center gap-2">
                          <ProgressBar
                            percent={kpi.pct}
                            className={cn(
                              "h-1.5 flex-1",
                              kpi.status === "BELOW" ? "[&>div]:bg-red-500 bg-red-100" :
                              kpi.status === "MET" ? "[&>div]:bg-emerald-500 bg-emerald-100" : ""
                            )}
                          />
                          <span className="text-xs font-bold text-brand-muted w-8 shrink-0">{kpi.pct}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={cn("text-xs font-bold", kpiStatusColor(kpi.status))}>
                          {kpiStatusLabel(kpi.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* KPI Trends Summary dynamically from backend */}
      {kpiRows.length > 0 && (
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-brand-navy flex items-center gap-1.5">
              <TrendingUp className="h-4.5 w-4.5 text-[#0052cc]" /> KPI Trends Summary
            </h2>
            <span className="text-xs text-brand-muted">current period</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {kpiRows.map((k, i) => (
              <div key={i} className="p-3 bg-white border border-[#c3c6d2]/40 rounded-lg flex justify-between items-center shadow-sm">
                <span className="text-xs font-semibold text-brand-navy">{k.module}</span>
                <span className="text-xs font-bold text-[#0052cc]">{k.rawScore}/{k.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid: Productivity vs Overall Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Productivity Overview */}
        <div className="lg:col-span-2 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-bold text-brand-navy">Productivity Overview</h2>
            <StatusBadge label={dashboard?.summaryBanner.status ?? "No Data"} tone={scoreValue >= 60 ? "success" : "danger"} />
          </div>

          {isOverviewLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-brand" />
            </div>
          ) : overview.length === 0 ? (
            <div className="py-8 text-center text-xs text-brand-muted">
              No KPI progress data yet. Timesheets need to be approved to populate this chart.
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {overview.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-2">
                  <div className="flex justify-between text-xs font-semibold text-brand-navy">
                    <span>{item.name}</span>
                    <span>{item.current} / {item.target} ({item.percentage}%)</span>
                  </div>
                  <ProgressBar percent={item.percentage} className={cn("h-2", item.percentage < 50 ? "bg-red-100 [&>div]:bg-red-500" : "")} />
                  <div className="flex justify-between text-[10px] text-brand-muted">
                    <span className={cn(item.trend === "up" ? "text-emerald-600" : "text-red-500")}>
                      {item.change ?? "—"}
                    </span>
                    <span>TARGET: {item.target}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Overall Score Circle Card */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] flex flex-col items-center justify-between text-center">
          <h2 className="text-base font-bold text-brand-navy w-full text-left">Overall Score</h2>

          <div className="relative flex items-center justify-center my-6">
            <svg className="w-32 h-32 transform -rotate-90">
              <circle cx="64" cy="64" r="56" stroke="#f1f5f9" strokeWidth="12" fill="transparent" />
              <circle
                cx="64"
                cy="64"
                r="56"
                stroke="#0052cc"
                strokeWidth="12"
                fill="transparent"
                strokeDasharray="351.8"
                strokeDashoffset={351.8 - (351.8 * scoreValue) / 100}
                strokeLinecap="round"
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-3xl font-extrabold text-brand-navy">{scoreValue}%</span>
              <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Score</span>
            </div>
          </div>

          <p className="text-xs text-brand-muted font-medium px-4">
            {scoreValue === 0
              ? "No data yet — KPI scores appear after timesheets are approved."
              : scoreValue >= 75
              ? <><span className="text-[#0052cc] font-bold">Above average</span> — keep it up!</>
              : "Room to improve — check your KPI targets above."}
          </p>
        </div>
      </div>

      {/* Coach Advice */}
      {coach && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-[16px] border border-sky-100 bg-[#f0f9ff]/20 p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-brand-navy flex items-center gap-1.5">
                <Sparkles className="h-4.5 w-4.5 text-[#0052cc]" /> Your Performance Coach
              </h2>
              <StatusBadge label={scoreValue < 50 ? "Urgent Attention Needed" : "On Track"} tone={scoreValue < 50 ? "danger" : "success"} />
            </div>

            <div className="flex flex-col gap-4 text-xs leading-relaxed text-brand-navy">
              <div>
                <span className="font-bold text-sm block mb-1">Recommendation</span>
                <p className="text-brand-muted text-sm">{coach.recommendation}</p>
              </div>
              <div>
                <span className="font-bold text-sm block mb-1">Your Action Guide</span>
                <div className="flex flex-col gap-2 mt-2">
                  {coach.actionGuide.map((step, idx) => (
                    <div key={idx} className="flex gap-2">
                      <span className="text-[#0052cc] font-bold shrink-0">{idx + 1}.</span>
                      <span className="text-brand-muted font-medium">{step.replace(/^\d+\.\s*/, "")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Score Breakdown */}
          {kpiRows.length > 0 && (
            <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] flex flex-col justify-between">
              <div>
                <h2 className="text-base font-bold text-brand-navy mb-4 flex items-center gap-1.5">
                  <CheckSquare className="h-4.5 w-4.5 text-brand-navy" /> Module Score Breakdown
                </h2>
                <div className="flex flex-col gap-3">
                  {kpiRows.slice(0, 4).map((k, i) => (
                    <div key={i} className="flex justify-between items-center text-xs border-b border-[#c3c6d2]/20 pb-2">
                      <span className="text-brand-navy font-medium truncate max-w-[140px]">{k.module}</span>
                      <span className="font-bold text-[#0052cc] shrink-0 ml-2">{k.rawScore}/{k.target}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-[#c3c6d2]/30 pt-3 text-xs flex justify-between text-brand-muted font-medium">
                <span>Total KPIs: {kpiRows.length}</span>
                <span>Score: <span className="font-bold text-brand-navy">{scoreValue}%</span></span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historical Performance Trend (real data from /performance/history) */}
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <h2 className="text-base font-bold text-brand-navy mb-1.5">Historical Performance Trend</h2>
        <p className="text-xs text-brand-muted mb-6">Weekly composite score (KPI × attendance × task completion)</p>

        {isHistoryLoading ? (
          <div className="h-48 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-brand" />
          </div>
        ) : (
          <div className="h-48 flex items-end justify-between border-b border-[#c3c6d2]/40 pb-4 px-2 gap-1">
            {history.map((pt, idx) => {
              const heightPct = Math.max(4, pt.score);
              const hasData = pt.sampleSize > 0;
              return (
                <div key={idx} className="flex flex-col items-center gap-2 flex-1 min-w-0">
                  <div className="text-[9px] text-brand-muted font-bold">{pt.score > 0 ? `${pt.score}%` : ""}</div>
                  <div
                    className={cn(
                      "w-full max-w-[40px] rounded-t transition-colors",
                      hasData ? "bg-[#0052cc] hover:bg-brand" : "bg-sky-100"
                    )}
                    style={{ height: `${(heightPct / 100) * 160}px` }}
                    title={`${pt.period}: ${pt.score}% (${pt.sampleSize} records)`}
                  />
                  <span className="text-[10px] font-bold text-brand-muted truncate w-full text-center">{pt.period}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-4 mt-3 text-[10px] text-brand-muted">
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-[#0052cc]" /> Has data</div>
          <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-sky-100" /> No data yet</div>
        </div>
      </div>
    </div>
  );
}

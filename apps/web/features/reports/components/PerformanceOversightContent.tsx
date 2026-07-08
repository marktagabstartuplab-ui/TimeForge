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
  User,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { 
  getPerformanceDashboard, 
  getPerformanceOverview, 
  getPerformanceMetrics, 
  getPerformanceKpis, 
  getPerformanceTrends, 
  getPerformanceHistory, 
  getPerformanceCoach,
  queuePerformanceExport
} from "../api/performance.service";

export function PerformanceOversightContent() {
  const [toast, setToast] = useState<ToastState | null>(null);

  // Filtering & Queries parameters
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

  const { data: trends = [], isLoading: isTrendsLoading } = useQuery({
    queryKey: ["perf", "trends", queryParams],
    queryFn: () => getPerformanceTrends(queryParams),
  });

  const { data: coach, isLoading: isCoachLoading } = useQuery({
    queryKey: ["perf", "coach", queryParams],
    queryFn: () => getPerformanceCoach(queryParams),
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

  const scoreValue = dashboard?.summaryBanner.score ?? 75;

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
              <div className="relative w-60">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-brand-muted" />
                <Input 
                  placeholder="Search Employee ID..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8.5 text-xs"
                />
              </div>
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
                {dashboard?.summaryBanner.rating ?? "Needs Attention"}
              </span>
              <span className="text-xs text-brand-muted font-medium">Score: {scoreValue}% Target</span>
            </div>
            <p className="text-sm font-semibold text-brand-navy mt-1.5 leading-snug">
              {scoreValue < 50 
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
            <div className="text-sm font-bold text-brand-navy mt-1">{dashboard?.summaryBanner.kpisTracked ?? 8} KPIs</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">STATUS</div>
            <div className="text-sm font-bold text-brand-navy mt-1">
              {dashboard?.summaryBanner.status ?? "On Track"}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Efficiency */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-5 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-brand-muted uppercase tracking-wider">Efficiency Score</span>
            <div className="text-3xl font-extrabold text-brand-navy mt-1.5">
              {dashboard?.summaryCards.efficiency.value ?? "94%"}
            </div>
            <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-[#15803d]">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>{dashboard?.summaryCards.efficiency.change ?? "+2.4% vs last week"}</span>
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
              {dashboard?.summaryCards.attendance.value ?? "98%"}
            </div>
            <div className="text-xs font-semibold text-brand-muted mt-2">
              {dashboard?.summaryCards.attendance.change ?? "On track for Quarterly Bonus"}
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
              {dashboard?.summaryCards.taskCompletion.value ?? "14/18"}
            </div>
            <div className="mt-2.5">
              <ProgressBar 
                percent={
                  dashboard?.summaryCards.taskCompletion.total 
                    ? Math.round((dashboard.summaryCards.taskCompletion.completed / dashboard.summaryCards.taskCompletion.total) * 100)
                    : 78
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
              {dashboard?.summaryCards.kpiScore.value ?? "75%"}
            </div>
            <div className="flex items-center gap-1 mt-2 text-xs font-semibold text-[#15803d]">
              <TrendingUp className="h-3.5 w-3.5" />
              <span>{dashboard?.summaryCards.kpiScore.change ?? "+4% vs last week"}</span>
            </div>
          </div>
          <div className="h-10 w-10 rounded-full bg-pink-50 text-pink-600 flex items-center justify-center">
            <PieChart className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* KPI Trends Summary dynamically from backend */}
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-brand-navy flex items-center gap-1.5">
            <TrendingUp className="h-4.5 w-4.5 text-[#0052cc]" /> KPI Trends Summary
          </h2>
          <span className="text-xs text-brand-muted">vs previous weekly</span>
        </div>

        <div className="bg-gray-50/50 rounded-xl p-4 border border-gray-100 mb-4">
          <span className="text-[9px] font-bold uppercase tracking-wider text-brand-muted flex items-center gap-1.5">
            <Briefcase className="h-3 w-3" /> AI Full Stack Engineer Configured Metrics
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {kpiRows.length === 0 ? (
            <>
              <div className="p-3 bg-white border border-[#c3c6d2]/40 rounded-lg flex justify-between items-center shadow-sm">
                <span className="text-xs font-semibold text-brand-navy">Deployments Completed</span>
                <span className="text-xs font-bold text-brand-muted">—</span>
              </div>
              <div className="p-3 bg-white border border-[#c3c6d2]/40 rounded-lg flex justify-between items-center shadow-sm">
                <span className="text-xs font-semibold text-brand-navy">AI Automation Implemented</span>
                <span className="text-xs font-bold text-brand-muted">—</span>
              </div>
              <div className="p-3 bg-white border border-[#c3c6d2]/40 rounded-lg flex justify-between items-center shadow-sm">
                <span className="text-xs font-semibold text-brand-navy">API Integrations Completed</span>
                <span className="text-xs font-bold text-brand-muted">—</span>
              </div>
              <div className="p-3 bg-white border border-[#c3c6d2]/40 rounded-lg flex justify-between items-center shadow-sm">
                <span className="text-xs font-semibold text-brand-navy">Bugs Resolved</span>
                <span className="text-xs font-bold text-brand-muted">—</span>
              </div>
            </>
          ) : (
            kpiRows.map((k, i) => (
              <div key={i} className="p-3 bg-white border border-[#c3c6d2]/40 rounded-lg flex justify-between items-center shadow-sm">
                <span className="text-xs font-semibold text-brand-navy">{k.module}</span>
                <span className="text-xs font-bold text-[#0052cc]">{k.rawScore}/{k.target}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Punctuality */}
        <div className="bg-white border border-[#c3c6d2]/40 rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold text-brand-muted uppercase">Punctuality</span>
            <span className="text-xs font-bold text-[#15803d]">+2%</span>
          </div>
          <div className="text-xl font-extrabold text-brand-navy">{metrics?.punctuality.percentage ?? 96}%</div>
          <div className="mt-2.5"><ProgressBar percent={metrics?.punctuality.percentage ?? 96} className="h-1" /></div>
        </div>

        {/* Focus Score */}
        <div className="bg-white border border-[#c3c6d2]/40 rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold text-brand-muted uppercase">Focus Score</span>
            <span className="text-xs font-bold text-red-600">-1%</span>
          </div>
          <div className="text-xl font-extrabold text-brand-navy">{metrics?.focusScore.percentage ?? 88}%</div>
          <div className="mt-2.5"><ProgressBar percent={metrics?.focusScore.percentage ?? 88} className="h-1 bg-sky-100" /></div>
        </div>

        {/* Utilization */}
        <div className="bg-white border border-[#c3c6d2]/40 rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold text-brand-muted uppercase">Billable Utilization</span>
            <span className="text-xs font-bold text-brand-muted">0%</span>
          </div>
          <div className="text-xl font-extrabold text-brand-navy">{metrics?.billableUtilization.percentage ?? 78}%</div>
          <div className="mt-2.5"><ProgressBar percent={metrics?.billableUtilization.percentage ?? 78} className="h-1 bg-sky-100" /></div>
        </div>

        {/* Target Alignment */}
        <div className="bg-white border border-[#c3c6d2]/40 rounded-xl p-4 shadow-sm">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold text-brand-muted uppercase">Target Alignment</span>
            <span className="text-xs font-bold text-[#15803d]">+4%</span>
          </div>
          <div className="text-xl font-extrabold text-brand-navy">{metrics?.targetAlignment.percentage ?? 92}%</div>
          <div className="mt-2.5"><ProgressBar percent={metrics?.targetAlignment.percentage ?? 92} className="h-1" /></div>
        </div>
      </div>

      {/* Main Grid: Productivity vs Overall Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Productivity Overview */}
        <div className="lg:col-span-2 rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-bold text-brand-navy">Productivity Overview</h2>
            <StatusBadge label="On Track" tone="success" />
          </div>

          <div className="flex flex-col gap-6">
            {overview.map((item, idx) => (
              <div key={idx} className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-semibold text-brand-navy">
                  <span>{item.name}</span>
                  <span>{item.current} / {item.target} ({item.percentage}%)</span>
                </div>
                <ProgressBar percent={item.percentage} className={cn("h-2", idx === 1 ? "bg-red-100 [&>div]:bg-red-500" : "")} />
                <div className="flex justify-between text-[10px] text-brand-muted">
                  <span className={cn(item.trend === "up" ? "text-emerald-600" : "text-red-500")}>
                    {item.change}
                  </span>
                  <span>TARGET: {item.target} {item.name.split(" ").slice(-1)[0].toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Overall Score Circle Card */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] flex flex-col items-center justify-between text-center">
          <h2 className="text-base font-bold text-brand-navy w-full text-left">Overall Score</h2>
          
          <div className="relative flex items-center justify-center my-6">
            {/* Draw a circular progress indicator */}
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
            You are performing <span className="text-[#0052cc] font-bold">above average</span> compared to team baseline.
          </p>
        </div>
      </div>

      {/* Coach & Score Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Performance Coach */}
        <div className="lg:col-span-2 rounded-[16px] border border-sky-100 bg-[#f0f9ff]/20 p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-brand-navy flex items-center gap-1.5">
              <Sparkles className="h-4.5 w-4.5 text-[#0052cc]" /> Your Performance Coach
            </h2>
            <StatusBadge label="Urgent Attention Needed" tone="danger" />
          </div>

          <div className="flex flex-col gap-4 text-xs leading-relaxed text-brand-navy">
            <div>
              <span className="font-bold text-sm block mb-1">Recommendation</span>
              <p className="text-brand-muted text-sm">{coach?.recommendation}</p>
            </div>

            <div>
              <span className="font-bold text-sm block mb-1">Your Action Guide</span>
              <div className="flex flex-col gap-2 mt-2">
                {coach?.actionGuide.map((step, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-[#0052cc] font-bold shrink-0">{idx + 1}.</span>
                    <span className="text-brand-muted font-medium">{step.replace(/^\d+\.\s*/, "")}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-brand-muted/80 italic mt-2 border-t border-sky-100/40 pt-3">
              Note: This requires urgent action, but it is not too late. Focus on taking small, concrete steps forward today. Every bit of progress matters.
            </p>
          </div>
        </div>

        {/* Module Score Breakdown */}
        <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)] flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-brand-navy mb-4 flex items-center gap-1.5">
              <CheckSquare className="h-4.5 w-4.5 text-brand-navy" /> Module Score Breakdown
            </h2>

            <div className="bg-[#be123c]/5 border border-red-100 rounded-xl p-4 mb-4">
              <div className="font-bold text-brand-navy text-xs">Sr. Product Engineer</div>
              <div className="text-[10px] text-brand-muted mt-1">Weight: 100% • 8 KPIs evaluated</div>

              <div className="mt-4 flex items-center justify-between border-t border-red-100/40 pt-3 text-center">
                <div>
                  <span className="text-[10px] font-bold text-brand-muted uppercase block">RAW SCORE</span>
                  <span className="text-sm font-extrabold text-[#be123c] block mt-1">33.7</span>
                </div>
                <span className="text-xs text-brand-muted">×</span>
                <div>
                  <span className="text-[10px] font-bold text-brand-muted uppercase block">WEIGHT</span>
                  <span className="text-sm font-extrabold text-brand-navy block mt-1">1.00</span>
                </div>
                <span className="text-xs text-brand-muted">=</span>
                <div>
                  <span className="text-[10px] font-bold text-brand-muted uppercase block">CONTRIBUTION</span>
                  <span className="text-sm font-extrabold text-[#be123c] block mt-1">33.7</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-[#c3c6d2]/30 pt-3 text-xs flex justify-between text-brand-muted font-medium">
            <span>Total modules: 1</span>
            <span>Weighted Total: <span className="font-bold text-brand-navy">33.7</span></span>
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-6 shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
        <h2 className="text-base font-bold text-brand-navy mb-1.5">Weekly Performance Trend</h2>
        <p className="text-xs text-brand-muted mb-6">Hourly output across the current sprint</p>

        <div className="h-64 flex items-end justify-between border-b border-[#c3c6d2]/40 pb-4 px-2">
          {trends.length === 0 ? (
            ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => (
              <div key={day} className="flex flex-col items-center gap-2 w-12">
                <div className="bg-sky-100 hover:bg-[#0052cc] w-4 h-24 rounded transition-colors cursor-pointer"></div>
                <span className="text-[10px] font-bold text-brand-muted">{day}</span>
              </div>
            ))
          ) : (
            trends.map((t, idx) => (
              <div key={idx} className="flex flex-col items-center gap-2 w-12">
                <div 
                  className={cn(
                    "w-4 rounded transition-colors cursor-pointer",
                    t.day === "WED" ? "bg-[#0052cc]" : "bg-sky-100 hover:bg-[#0052cc]"
                  )} 
                  style={{ height: `${Math.max(10, Math.min(200, t.hours * 20))}px` }}
                ></div>
                <span className={cn("text-[10px] font-bold", t.day === "WED" ? "text-[#0052cc]" : "text-brand-muted")}>
                  {t.day}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Download,
  Sparkles,
  Users,
  Target,
  AlertTriangle,
  HeartPulse,
  ChevronRight,
  Eye,
  User,
  BrainCircuit,
  Calendar,
  Clock,
  Activity,
  Zap,
  Shield,
  BarChart3,
  Search,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Timer,
  UserPlus,
  BookOpen,
  Award,
  Scale,
  ListChecks,
  Flame,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { SectionCard } from "@/components/shared/SectionCard";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ProgressBar } from "@/components/shared/ProgressBar";
import { ErrorState } from "@/components/shared/ErrorState";
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
import {
  getSupervisorAiDashboard,
  getSupervisorAiLeaderboard,
  getSupervisorAiInsights,
  getSupervisorAiRecommendations,
  getSupervisorAiTeamHealth,
  getSupervisorAiTrends,
  getSupervisorAiAlerts,
  queueSupervisorAiExport,
  type AiDashboardResponse,
  type LeaderboardEntry,
  type AiCoachInsight,
  type AiRecommendation,
  type TeamHealthResponse,
  type TrendsResponse,
  type AiAlert,
  type SupervisorAiQuery,
} from "../api/supervisor-ai.service";
import { RecurringIssuesPanel } from "@/features/recurring-issues/components/RecurringIssuesPanel";

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

const statusConfig: Record<string, BadgeTone> = {
  Exceeding: "success",
  "On Track": "info",
  "Needs Attention": "warning",
  Critical: "danger",
};

const severityConfig: Record<string, { label: string; tone: BadgeTone }> = {
  HIGH: { label: "High", tone: "danger" },
  MEDIUM: { label: "Medium", tone: "warning" },
  LOW: { label: "Low", tone: "info" },
};

const priorityConfig: Record<string, BadgeTone> = {
  high: "danger",
  medium: "warning",
  low: "info",
};

function TrendIcon({ trend, className }: { trend: string; className?: string }) {
  if (trend === "up") return <TrendingUp className={cn("h-3 w-3 text-emerald-600", className)} />;
  if (trend === "down") return <TrendingDown className={cn("h-3 w-3 text-red-500", className)} />;
  return <Minus className={cn("h-3 w-3 text-brand-muted", className)} />;
}

export function SupervisorAiInsightsContent() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [insightPriority, setInsightPriority] = useState<string>("ALL");
  const [alertSeverity, setAlertSeverity] = useState<string>("ALL");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);

  const query: SupervisorAiQuery = useMemo(() => ({
    ...(selectedEmployee ? { employeeId: selectedEmployee } : {}),
    period,
  }), [selectedEmployee, period]);

  const { data: dashboard, isLoading: isDashLoading, isError: isDashError, refetch: refetchDash } = useQuery({
    queryKey: ["supervisor-ai", "dashboard", query],
    queryFn: () => getSupervisorAiDashboard(query),
    refetchInterval: 60_000,
  });

  const { data: leaderboard = [], isLoading: isLeaderLoading, refetch: refetchLeader } = useQuery({
    queryKey: ["supervisor-ai", "leaderboard", query],
    queryFn: () => getSupervisorAiLeaderboard(query),
    refetchInterval: 60_000,
  });

  const { data: insightsData, isLoading: isInsightsLoading, refetch: refetchInsights } = useQuery({
    queryKey: ["supervisor-ai", "insights", query],
    queryFn: () => getSupervisorAiInsights(query),
    refetchInterval: 120_000,
  });

  const { data: recsData, isLoading: isRecsLoading, refetch: refetchRecs } = useQuery({
    queryKey: ["supervisor-ai", "recommendations", query],
    queryFn: () => getSupervisorAiRecommendations(query),
    refetchInterval: 120_000,
  });

  const { data: teamHealth, isLoading: isHealthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ["supervisor-ai", "team-health", query],
    queryFn: () => getSupervisorAiTeamHealth(query),
    refetchInterval: 120_000,
  });

  const { data: trends, isLoading: isTrendsLoading, refetch: refetchTrends } = useQuery({
    queryKey: ["supervisor-ai", "trends", query],
    queryFn: () => getSupervisorAiTrends(query),
    refetchInterval: 120_000,
  });

  const { data: alertsData, isLoading: isAlertsLoading, refetch: refetchAlerts } = useQuery({
    queryKey: ["supervisor-ai", "alerts", query, alertSeverity],
    queryFn: () => getSupervisorAiAlerts(query),
    refetchInterval: 30_000,
  });

  const exportMutation = useMutation({
    mutationFn: (format: "CSV" | "XLSX" | "PDF") => queueSupervisorAiExport({ format }),
    onSuccess: (res) => setToast({ message: res.message, tone: "success" }),
    onError: (err: any) => setToast({ message: err?.message || "Export failed.", tone: "error" }),
  });

  const handleRefresh = () => {
    refetchDash();
    refetchLeader();
    refetchInsights();
    refetchRecs();
    refetchHealth();
    refetchTrends();
    refetchAlerts();
    setToast({ message: "AI insights refreshed.", tone: "success" });
  };

  const filteredInsights = useMemo(() => {
    if (!insightsData?.insights) return [];
    return insightPriority === "ALL"
      ? insightsData.insights
      : insightsData.insights.filter((i) => i.priority === insightPriority);
  }, [insightsData, insightPriority]);

  const filteredAlerts = useMemo(() => {
    if (!alertsData?.alerts) return [];
    return alertSeverity === "ALL"
      ? alertsData.alerts
      : alertsData.alerts.filter((a) => a.severity === alertSeverity);
  }, [alertsData, alertSeverity]);

  return (
    <div className="flex flex-col gap-6">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Supervisor AI Insights</h1>
          <p className="text-sm text-brand-muted">AI-powered monitoring of team productivity, performance, and coaching recommendations</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="border border-[#c3c6d2] rounded-lg px-2.5 py-1 text-xs font-semibold bg-white flex items-center gap-1.5">
            <span className="text-brand-muted">Team:</span>
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="bg-transparent font-bold text-brand-navy outline-none border-none cursor-pointer"
            >
              <option value="">All Teams</option>
              {leaderboard.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div className="border border-[#c3c6d2] rounded-lg px-2.5 py-1 text-xs font-semibold bg-white flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-brand-muted" />
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as typeof period)}
              className="bg-transparent font-bold text-brand-navy outline-none border-none cursor-pointer"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Refresh</span>
          </Button>
          <div className="flex items-center gap-1 border border-[#c3c6d2] rounded-lg p-0.5 bg-white">
            <Button variant="ghost" size="sm" onClick={() => exportMutation.mutate("CSV")} className="h-7 text-[10px] font-bold" disabled={exportMutation.isPending}>
              <FileText className="h-3 w-3 mr-1" /> CSV
            </Button>
            <Button variant="ghost" size="sm" onClick={() => exportMutation.mutate("XLSX")} className="h-7 text-[10px] font-bold" disabled={exportMutation.isPending}>
              <Download className="h-3 w-3 mr-1" /> Excel
            </Button>
            <Button variant="ghost" size="sm" onClick={() => exportMutation.mutate("PDF")} className="h-7 text-[10px] font-bold" disabled={exportMutation.isPending}>
              <FileText className="h-3 w-3 mr-1" /> PDF
            </Button>
          </div>
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
              <Skeleton className="mt-1 h-3 w-16" />
            </div>
          ))
        ) : isDashError ? (
          <div className="col-span-full">
            <ErrorState onRetry={refetchDash} />
          </div>
        ) : dashboard ? (
          <>
            <SummaryCard icon={Users} label="Avg Team Performance" value={dashboard.summaryCards.avgTeamPerformance.value} change={dashboard.summaryCards.avgTeamPerformance.change} trend={dashboard.summaryCards.avgTeamPerformance.trend} />
            <SummaryCard icon={Zap} label="AI Automations" value={dashboard.summaryCards.aiAutomations.value} change={dashboard.summaryCards.aiAutomations.change} trend={dashboard.summaryCards.aiAutomations.trend} />
            <SummaryCard icon={AlertTriangle} label="Active Risks" value={dashboard.summaryCards.activeRisks.value} change={dashboard.summaryCards.activeRisks.change} trend={dashboard.summaryCards.activeRisks.trend} />
            <SummaryCard icon={TrendingUp} label="Productivity Impr." value={dashboard.summaryCards.productivityImprovement.value} change={dashboard.summaryCards.productivityImprovement.change} trend={dashboard.summaryCards.productivityImprovement.trend} />
            <SummaryCard icon={HeartPulse} label="Team Health Score" value={dashboard.summaryCards.teamHealthScore.value} change={dashboard.summaryCards.teamHealthScore.change} trend={dashboard.summaryCards.teamHealthScore.trend} />
          </>
        ) : null}
      </div>

      {dashboard && (
        <p className="text-[10px] text-brand-muted text-right -mt-4">Last updated: {formatDate(dashboard.lastUpdated)}</p>
      )}

      {/* AI Performance Leaderboard + Team Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leaderboard */}
        <SectionCard title="AI Performance Leaderboard" className="lg:col-span-2">
          {isLeaderLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-full" /><div className="flex-1"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-20 mt-1" /></div><Skeleton className="h-6 w-20 rounded-full" /></div>
              ))}
            </div>
          ) : leaderboard.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[#c3c6d2]/40 text-xs font-semibold text-brand-muted uppercase tracking-wider">
                    <th className="py-3 pr-4">Employee</th>
                    <th className="py-3 pr-4">Department</th>
                    <th className="py-3 pr-4">Performance Score</th>
                    <th className="py-3 pr-4">Trend</th>
                    <th className="py-3 pr-4">AI Status</th>
                    <th className="py-3 pr-4">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c3c6d2]/30">
                  {leaderboard.map((member, idx) => (
                    <tr key={member.id} className="hover:bg-[#f8fafc] transition-colors">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white",
                            idx === 0 ? "bg-amber-500" : idx === 1 ? "bg-slate-400" : idx === 2 ? "bg-amber-700" : "bg-brand-muted/40",
                          )}>
                            {idx + 1}
                          </div>
                          <span className="font-semibold text-brand-navy">{member.name}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-brand-muted">{member.department}</td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 max-w-[80px]">
                            <div className="h-1.5 rounded-full bg-[#e4e2e3] overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  member.performanceScore >= 80 ? "bg-emerald-500" : member.performanceScore >= 60 ? "bg-brand" : member.performanceScore >= 40 ? "bg-amber-500" : "bg-red-500",
                                )}
                                style={{ width: `${member.performanceScore}%` }}
                              />
                            </div>
                          </div>
                          <span className="text-xs font-bold text-brand-navy w-8">{member.performanceScore}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <TrendIcon trend={member.productivityTrend} />
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge label={member.aiStatus} tone={statusConfig[member.aiStatus] ?? "neutral"} />
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-brand" onClick={() => setSelectedEmployee(member.id)}>
                            <Eye className="h-3 w-3 mr-1" /> View
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-brand-muted" onClick={() => setToast({ message: `Performance history for ${member.name}`, tone: "info" })}>
                            <BarChart3 className="h-3 w-3 mr-1" /> History
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-sm text-brand-muted">No team member data available.</div>
          )}
        </SectionCard>

        {/* Team Health */}
        <SectionCard title="Team Health Breakdown">
          {isHealthLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-[120px] w-[120px] rounded-full mx-auto" />
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : teamHealth ? (
            <div className="flex flex-col gap-4">
              {/* Circular Score */}
              <div className="flex justify-center">
                <div className="relative flex items-center justify-center">
                  <svg className="w-28 h-28 transform -rotate-90">
                    <circle cx="56" cy="56" r="48" stroke="#f1f5f9" strokeWidth="8" fill="transparent" />
                    <circle
                      cx="56" cy="56" r="48"
                      stroke={teamHealth.overallHealthScore >= 80 ? "#16a34a" : teamHealth.overallHealthScore >= 60 ? "#0052cc" : "#dc2626"}
                      strokeWidth="8" fill="transparent"
                      strokeDasharray="301.6"
                      strokeDashoffset={301.6 - (301.6 * teamHealth.overallHealthScore) / 100}
                      strokeLinecap="round"
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-2xl font-extrabold text-brand-navy">{teamHealth.overallHealthScore}%</span>
                    <span className="text-[10px] font-bold text-brand-muted uppercase">Health</span>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <StatusBadge label={`${teamHealth.riskLevel} Risk`} tone={teamHealth.riskLevel === "Low" ? "success" : teamHealth.riskLevel === "Moderate" ? "warning" : "danger"} />
              </div>

              {/* Score Bars */}
              <div className="space-y-3">
                {teamHealth.scores.map((s) => (
                  <div key={s.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-brand-navy">{s.label}</span>
                      <span className="text-brand-muted">{s.value}% / {s.target}%</span>
                    </div>
                    <ProgressBar
                      percent={s.value}
                      className="h-1.5"
                      barClassName={s.value >= 80 ? "bg-emerald-500" : s.value >= 60 ? "bg-brand" : "bg-amber-500"}
                    />
                  </div>
                ))}
              </div>

              {/* Trend */}
              {teamHealth.historicalTrend.length > 0 && (
                <div className="h-16">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={teamHealth.historicalTrend}>
                      <defs>
                        <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0052cc" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#0052cc" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="score" stroke="#0052cc" strokeWidth={2} fill="url(#healthGrad)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              <p className="text-xs text-brand-muted italic">{teamHealth.aiSummary}</p>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-sm text-brand-muted">No health data.</div>
          )}
        </SectionCard>
      </div>

      {/* AI Coach Insights */}
      <SectionCard
        title="AI Coach Insights"
        action={
          <div className="flex items-center gap-1 rounded-[8px] border border-[#c3c6d2]/50 p-0.5">
            <button type="button" onClick={() => setInsightPriority("ALL")}
              className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", insightPriority === "ALL" ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}>All</button>
            <button type="button" onClick={() => setInsightPriority("high")}
              className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", insightPriority === "high" ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}>High</button>
            <button type="button" onClick={() => setInsightPriority("medium")}
              className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", insightPriority === "medium" ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}>Medium</button>
            <button type="button" onClick={() => setInsightPriority("low")}
              className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", insightPriority === "low" ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}>Low</button>
          </div>
        }
      >
        {isInsightsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-[12px] border border-[#c3c6d2]/40 p-4"><Skeleton className="h-5 w-32 mb-2" /><Skeleton className="h-12 w-full mb-2" /><Skeleton className="h-3 w-20" /></div>
            ))}
          </div>
        ) : filteredInsights.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInsights.map((insight, idx) => (
              <CoachInsightCard
                key={`${insight.type}-${idx}`}
                insight={insight}
                isExpanded={expandedInsight === `${insight.type}-${idx}`}
                onToggle={() => setExpandedInsight(expandedInsight === `${insight.type}-${idx}` ? null : `${insight.type}-${idx}`)}
              />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-brand-muted">No AI coach insights available. Trigger an AI advisory to generate insights.</div>
        )}
      </SectionCard>

      {/* Team Efficiency Trends */}
      <SectionCard
        title="Team Efficiency Trends"
        action={
          <div className="flex items-center gap-1 rounded-[8px] border border-[#c3c6d2]/50 p-0.5">
            {(["daily", "weekly", "monthly"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPeriod(p)}
                className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", period === p ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        }
      >
        {isTrendsLoading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : trends && trends.daily.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Productivity / Hours Chart */}
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <RechartsTooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return <div className="rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-2 text-sm shadow-sm">
                      <p className="font-medium text-brand-navy">{label}</p>
                      {payload.map((p, i) => (
                        <p key={i} className="text-brand-muted text-xs">{p.name}: {Number(p.value).toFixed(1)}</p>
                      ))}
                    </div>;
                  }} />
                  <Bar dataKey="hours" fill="#0052cc" radius={[4, 4, 0, 0]} name="Hours" />
                  <Bar dataKey="tasks" fill="#10b981" radius={[4, 4, 0, 0]} name="Tasks" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Focus Time & Velocity Chart */}
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends.daily}>
                  <defs>
                    <linearGradient id="focusGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                  <RechartsTooltip />
                  <Area type="monotone" dataKey="focus" stroke="#f59e0b" strokeWidth={2} fill="url(#focusGrad)" name="Focus Time %" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Summary stats */}
            <div className="lg:col-span-2 grid grid-cols-4 gap-4 border-t border-[#c3c6d2]/30 pt-4">
              <div className="text-center">
                <p className="text-[10px] font-bold text-brand-muted uppercase">Total Hours</p>
                <p className="text-xl font-bold text-brand-navy">{trends.summary.totalHours.toFixed(1)}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-brand-muted uppercase">Tasks Completed</p>
                <p className="text-xl font-bold text-brand-navy">{trends.summary.totalTasks}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-brand-muted uppercase">Focus Time</p>
                <p className="text-xl font-bold text-brand-navy">{trends.summary.avgFocusTime}%</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-brand-muted uppercase">Team Velocity</p>
                <p className="text-xl font-bold text-brand-navy">{trends.summary.teamVelocity}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-[200px] items-center justify-center text-sm text-brand-muted">No trend data available.</div>
        )}
      </SectionCard>

      {/* Action Center */}
      <SectionCard
        title="Action Center"
        action={
          <div className="flex items-center gap-1 rounded-[8px] border border-[#c3c6d2]/50 p-0.5">
            <button type="button" onClick={() => setAlertSeverity("ALL")}
              className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", alertSeverity === "ALL" ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}>All</button>
            <button type="button" onClick={() => setAlertSeverity("HIGH")}
              className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", alertSeverity === "HIGH" ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}>High</button>
            <button type="button" onClick={() => setAlertSeverity("MEDIUM")}
              className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", alertSeverity === "MEDIUM" ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}>Medium</button>
            <button type="button" onClick={() => setAlertSeverity("LOW")}
              className={cn("rounded-[6px] px-3 py-1 text-xs font-medium transition-colors", alertSeverity === "LOW" ? "bg-brand text-white" : "text-brand-muted hover:text-brand-navy")}>Low</button>
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
        ) : filteredAlerts.length > 0 ? (
          <div className="flex flex-col gap-2">
            {filteredAlerts.map((alert, idx) => (
              <AlertRow key={`${alert.type}-${idx}`} alert={alert} onAction={(action) => setToast({ message: `${action} triggered for alert: ${alert.title}`, tone: "info" })} />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-brand-muted">No AI alerts at this time. All metrics are within normal range.</div>
        )}
      </SectionCard>

      {/* AI Recommendation Feed */}
      <SectionCard title="AI Recommendation Feed">
        {isRecsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-[12px] border border-[#c3c6d2]/40 p-4"><Skeleton className="h-5 w-36 mb-2" /><Skeleton className="h-10 w-full mb-2" /><Skeleton className="h-3 w-24" /></div>
            ))}
          </div>
        ) : recsData && recsData.recommendations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recsData.recommendations.map((rec, idx) => (
              <RecommendationCard key={`${rec.type}-${idx}`} recommendation={rec} />
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-sm text-brand-muted">No recommendations yet. Enable AI insights to generate recommendations.</div>
        )}

        {recsData && (
          <div className="flex items-center justify-between border-t border-[#c3c6d2]/30 pt-4 mt-2">
            <span className="text-xs text-brand-muted">{recsData.total} recommendations generated</span>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => refetchRecs()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
        )}
      </SectionCard>

      {/* Risk Monitoring Panel */}
      <SectionCard title="Risk Monitoring Panel">
        {isHealthLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <RiskCard
              title="Burnout Risk"
              icon={Flame}
              severity={leaderboard.filter((m) => m.aiStatus === "Critical").length > 0 ? "HIGH" : leaderboard.filter((m) => m.aiStatus === "Needs Attention").length > 0 ? "MEDIUM" : "LOW"}
              affectedCount={leaderboard.filter((m) => m.aiStatus === "Critical" || m.aiStatus === "Needs Attention").length}
              explanation={`${leaderboard.filter((m) => m.aiStatus === "Critical").length} critical, ${leaderboard.filter((m) => m.aiStatus === "Needs Attention").length} needing attention`}
            />
            <RiskCard
              title="Attendance Risk"
              icon={Calendar}
              severity={teamHealth && teamHealth.scores.find((s) => s.label === "Attendance")?.value && teamHealth.scores.find((s) => s.label === "Attendance")!.value < 70 ? "HIGH" : "LOW"}
              affectedCount={teamHealth && teamHealth.scores.find((s) => s.label === "Attendance") ? Math.round((100 - teamHealth.scores.find((s) => s.label === "Attendance")!.value) / 10) : 0}
              explanation={`Attendance score at ${teamHealth?.scores.find((s) => s.label === "Attendance")?.value ?? "N/A"}%`}
            />
            <RiskCard
              title="Performance Risk"
              icon={Target}
              severity={leaderboard.filter((m) => m.performanceScore < 40).length > 0 ? "HIGH" : leaderboard.filter((m) => m.performanceScore < 60).length > 0 ? "MEDIUM" : "LOW"}
              affectedCount={leaderboard.filter((m) => m.performanceScore < 60).length}
              explanation={`${leaderboard.filter((m) => m.performanceScore < 40).length} below 40%, ${leaderboard.filter((m) => m.performanceScore < 60 && m.performanceScore >= 40).length} below 60%`}
            />
            <RiskCard
              title="Project Delay Risk"
              icon={Clock}
              severity={alertsData?.alerts.filter((a) => a.type === "MISSED_DEADLINES" || a.type === "PROJECT_DELAY_RISK").length ?? 0 > 0 ? "MEDIUM" : "LOW"}
              affectedCount={alertsData?.alerts.filter((a) => a.type === "MISSED_DEADLINES" || a.type === "PROJECT_DELAY_RISK").reduce((s, a) => s + a.affectedEmployees.length, 0) ?? 0}
              explanation="Based on deadline and dependency-related scrum blockers"
            />
            <RiskCard
              title="Overtime Risk"
              icon={Activity}
              severity={leaderboard.filter((m) => m.totalHours > 160).length > 0 ? "MEDIUM" : "LOW"}
              affectedCount={leaderboard.filter((m) => m.totalHours > 160).length}
              explanation={`${leaderboard.filter((m) => m.totalHours > 160).length} members exceeding 160h`}
            />
          </div>
        )}
      </SectionCard>

      <RecurringIssuesPanel />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, change, trend }: {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string | number;
  change: number;
  trend: string;
}) {
  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-white p-[21px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-start justify-between">
        <Icon className="h-[26px] w-[26px] text-brand" aria-hidden="true" />
        <span className={cn(
          "flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold",
          trend === "up" ? "bg-[#f0fdf4] text-[#16a34a]" : trend === "down" ? "bg-[#fef2f2] text-[#dc2626]" : "bg-[#f5f5f5] text-[#737373]",
        )}>
          {trend === "up" ? <TrendingUp className="h-3 w-3" /> : trend === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
          {Math.abs(change).toFixed(1)}%
        </span>
      </div>
      <p className="mt-2 text-xs text-brand-muted font-semibold">{label}</p>
      <p className="mt-1 text-2xl font-bold text-brand-ink">{value}</p>
    </div>
  );
}

function CoachInsightCard({ insight, isExpanded, onToggle }: {
  insight: AiCoachInsight;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const iconMap: Record<string, React.FC<{ className?: string }>> = {
    API_INTEGRATION_HELP: BrainCircuit,
    WORKFLOW_OPTIMIZATION: Activity,
    MEETING_EFFICIENCY: Clock,
    SKILL_IMPROVEMENT: BookOpen,
    BURNOUT_PREVENTION: Flame,
    COMMUNICATION_COACHING: Users,
  };
  const Icon = iconMap[insight.type] ?? Sparkles;

  return (
    <div className={cn(
      "rounded-[12px] border p-4 transition-all cursor-pointer",
      insight.priority === "high" ? "border-red-100 bg-red-50/20" : "border-[#c3c6d2]/40 bg-white",
    )} onClick={onToggle}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]",
          insight.priority === "high" ? "bg-red-50 text-red-600" : insight.priority === "medium" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600",
        )}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-brand-navy">{insight.title}</p>
            <StatusBadge label={insight.priority.charAt(0).toUpperCase() + insight.priority.slice(1)} tone={priorityConfig[insight.priority] ?? "neutral"} />
          </div>
          <p className={cn("mt-1 text-xs text-brand-muted", !isExpanded && "line-clamp-2")}>{insight.description}</p>
          {isExpanded && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-brand-muted">
                <span>Confidence: {insight.confidence}%</span>
                <span>·</span>
                <span>{formatDate(insight.generatedAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-brand-muted font-semibold">Suggested action:</span>
                <span className="text-xs text-brand font-semibold">{insight.suggestedAction}</span>
              </div>
            </div>
          )}
        </div>
        <ChevronRight className={cn("h-4 w-4 text-brand-muted shrink-0 transition-transform", isExpanded && "rotate-90")} />
      </div>
    </div>
  );
}

function RecommendationCard({ recommendation: rec }: { recommendation: AiRecommendation }) {
  const iconMap: Record<string, React.FC<{ className?: string }>> = {
    PROMOTE_HIGH_PERFORMER: Award,
    REBALANCE_WORKLOAD: Scale,
    RECOMMEND_TRAINING: BookOpen,
    ADJUST_WORKLOAD: ListChecks,
    RECOGNIZE_ACHIEVEMENTS: CheckCircle2,
  };
  const Icon = iconMap[rec.type] ?? Sparkles;

  return (
    <div className="rounded-[12px] border border-[#c3c6d2]/40 bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.03)]">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-brand" />
        <h4 className="text-sm font-bold text-brand-navy">{rec.title}</h4>
      </div>
      <p className="text-xs text-brand-muted leading-relaxed mb-2">{rec.description}</p>
      {rec.employeeName && (
        <div className="flex items-center gap-1 text-xs text-brand font-semibold mb-2">
          <User className="h-3 w-3" /> {rec.employeeName}
        </div>
      )}
      <div className="flex items-center justify-between text-[10px] text-brand-muted">
        <span>Confidence: {rec.confidenceLevel}%</span>
        <span>{rec.expectedImpact}</span>
      </div>
      {rec.supportingData && (
        <p className="mt-1 text-[10px] italic text-brand-muted">{rec.supportingData}</p>
      )}
    </div>
  );
}

function AlertRow({ alert, onAction }: { alert: AiAlert; onAction: (actionType: string) => void }) {
  const iconMap: Record<string, React.FC<{ className?: string }>> = {
    PERFORMANCE_DECLINE: TrendingDown,
    COACHING_REQUIRED: UserPlus,
    BURNOUT_RISK: Flame,
    WORKLOAD_IMBALANCE: Scale,
    MISSED_DEADLINES: Clock,
    HIGH_OVERTIME: Activity,
    PROJECT_DELAY_RISK: AlertTriangle,
  };
  const Icon = iconMap[alert.type] ?? AlertTriangle;
  const sevCfg = severityConfig[alert.severity] ?? { label: alert.severity, tone: "neutral" as BadgeTone };

  return (
    <div className="flex items-start gap-3 rounded-[8px] border border-[#c3c6d2]/30 p-3 transition-colors hover:bg-[#f6f3f4]">
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px]",
        alert.severity === "HIGH" ? "bg-red-50 text-red-600" : alert.severity === "MEDIUM" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600",
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-brand-navy">{alert.title}</p>
          <StatusBadge label={sevCfg.label} tone={sevCfg.tone} />
        </div>
        <p className="mt-0.5 text-xs text-brand-muted">{alert.message}</p>
        {alert.affectedEmployees.length > 0 && (
          <p className="mt-0.5 text-xs text-brand-muted">
            Affected: {alert.affectedEmployees.length} employee{alert.affectedEmployees.length > 1 ? "s" : ""}
          </p>
        )}
        <p className="mt-1 text-[11px] italic text-brand-muted">{alert.aiExplanation}</p>
        <div className="mt-2">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onAction(alert.actionType)}>
            {alert.suggestedAction}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RiskCard({ title, icon: Icon, severity, affectedCount, explanation }: {
  title: string;
  icon: React.FC<{ className?: string }>;
  severity: string;
  affectedCount: number;
  explanation: string;
}) {
  const colorMap: Record<string, string> = {
    HIGH: "border-red-200 bg-red-50/30",
    MEDIUM: "border-amber-200 bg-amber-50/30",
    LOW: "border-emerald-200 bg-emerald-50/30",
  };
  const textColorMap: Record<string, string> = {
    HIGH: "text-red-600",
    MEDIUM: "text-amber-600",
    LOW: "text-emerald-600",
  };

  return (
    <div className={cn("rounded-[12px] border p-4", colorMap[severity] ?? "border-[#c3c6d2]/40")}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("h-4 w-4", textColorMap[severity])} />
        <span className="text-xs font-bold text-brand-navy">{title}</span>
      </div>
      <div className={cn("text-lg font-extrabold", textColorMap[severity])}>{severity}</div>
      <p className="text-xs text-brand-muted mt-1">{affectedCount} affected</p>
      <p className="text-[10px] text-brand-muted/70 mt-1 italic">{explanation}</p>
    </div>
  );
}

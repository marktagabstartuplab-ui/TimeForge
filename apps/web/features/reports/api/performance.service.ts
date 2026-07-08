import { apiClient } from "@/lib/api/client";

export interface PerformanceDashboardData {
  summaryBanner: {
    score: number;
    rating: string;
    status: string;
    timePeriod: string;
    kpisTracked: number;
  };
  summaryCards: {
    efficiency: { value: string; change: string; trend: string };
    attendance: { value: string; change: string; trend: string };
    taskCompletion: { value: string; completed: number; total: number; trend: string };
    kpiScore: { value: string; change: string; trend: string };
  };
}

export interface PerformanceOverviewItem {
  id?: string;
  name: string;
  current: number;
  target: number;
  percentage: number;
  change: string;
  trend: string;
}

export interface PerformanceMetricsData {
  punctuality: { percentage: number; change: string; trend: string };
  focusScore: { percentage: number; change: string; trend: string };
  billableUtilization: { percentage: number; change: string; trend: string };
  targetAlignment: { percentage: number; change: string; trend: string };
  dailyScrumCompletion: { percentage: number; change: string; trend: string };
  timesheetCompletion: { percentage: number; change: string; trend: string };
}

export interface PerformanceKpiRow {
  module: string;
  rawScore: number;
  target: number;
  weight: number;
  weightedContribution: number;
}

export interface PerformanceTrendPoint {
  day: string;
  hours: number;
  tasks: number;
}

export interface PerformanceHistoryPoint {
  period: string;
  score: number;
  /** How many underlying KPI/timesheet/scrum-task records fed this bucket's score (0 = no data yet, not a fabricated score). */
  sampleSize: number;
}

export interface PerformanceCoachAdvice {
  recommendation: string;
  summary?: string;
  actionGuide: string[];
  strengths: string[];
  areasForImprovement: string[];
}

export interface PerformanceQuery {
  userId?: string;
  departmentId?: string;
  teamId?: string;
  from?: string;
  to?: string;
  /** Only used by getPerformanceHistory; defaults to 'monthly' server-side. */
  granularity?: "weekly" | "monthly" | "quarterly" | "custom";
}

export async function getPerformanceDashboard(params: PerformanceQuery): Promise<PerformanceDashboardData> {
  const { data } = await apiClient.get<PerformanceDashboardData>("/performance/dashboard", { params });
  return data;
}

export async function getPerformanceOverview(params: PerformanceQuery): Promise<PerformanceOverviewItem[]> {
  const { data } = await apiClient.get<PerformanceOverviewItem[]>("/performance/overview", { params });
  return data;
}

export async function getPerformanceMetrics(params: PerformanceQuery): Promise<PerformanceMetricsData> {
  const { data } = await apiClient.get<PerformanceMetricsData>("/performance/metrics", { params });
  return data;
}

export async function getPerformanceKpis(params: PerformanceQuery): Promise<PerformanceKpiRow[]> {
  const { data } = await apiClient.get<PerformanceKpiRow[]>("/performance/kpis", { params });
  return data;
}

export async function getPerformanceTrends(params: PerformanceQuery): Promise<PerformanceTrendPoint[]> {
  const { data } = await apiClient.get<PerformanceTrendPoint[]>("/performance/trends", { params });
  return data;
}

export async function getPerformanceHistory(params: PerformanceQuery): Promise<PerformanceHistoryPoint[]> {
  const { data } = await apiClient.get<PerformanceHistoryPoint[]>("/performance/history", { params });
  return data;
}

export async function getPerformanceCoach(params: PerformanceQuery): Promise<PerformanceCoachAdvice> {
  const { data } = await apiClient.get<PerformanceCoachAdvice>("/performance/coach", { params });
  return data;
}

export async function queuePerformanceExport(dto: {
  format: "CSV" | "XLSX" | "PDF";
  userId?: string;
  departmentId?: string;
  teamId?: string;
}): Promise<{ jobId: string }> {
  const { data } = await apiClient.post<{ jobId: string }>("/performance/export", dto);
  return data;
}

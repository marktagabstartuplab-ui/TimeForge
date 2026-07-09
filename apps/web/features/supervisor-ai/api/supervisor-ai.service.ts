import { apiClient } from "@/lib/api/client";

export interface SupervisorAiQuery {
  teamId?: string;
  departmentId?: string;
  employeeId?: string;
  from?: string;
  to?: string;
  period?: "daily" | "weekly" | "monthly";
}

export interface SummaryCard {
  value: string | number;
  change: number;
  trend: "up" | "down" | "neutral";
}

export interface AiDashboardResponse {
  summaryCards: {
    avgTeamPerformance: SummaryCard;
    aiAutomations: SummaryCard;
    activeRisks: SummaryCard;
    productivityImprovement: SummaryCard;
    teamHealthScore: SummaryCard;
  };
  activePeriods: number;
  lastUpdated: string;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  department: string;
  performanceScore: number;
  productivityTrend: string;
  aiStatus: "Exceeding" | "On Track" | "Needs Attention" | "Critical";
  totalHours: number;
  kpisTracked: number;
}

export interface AiCoachInsight {
  type: string;
  title: string;
  description: string;
  priority: string;
  generatedAt: string;
  confidence: number;
  suggestedAction: string;
}

export interface AiInsightsResponse {
  insights: AiCoachInsight[];
  total: number;
}

export interface AiRecommendation {
  type: string;
  title: string;
  description: string;
  confidenceLevel: number;
  expectedImpact: string;
  supportingData: string;
  userId?: string;
  employeeName?: string;
}

export interface AiRecommendationsResponse {
  recommendations: AiRecommendation[];
  total: number;
}

export interface TeamHealthScore {
  label: string;
  value: number;
  target: number;
  gap: number;
}

export interface TeamHealthResponse {
  overallHealthScore: number;
  riskLevel: "Low" | "Moderate" | "High";
  scores: TeamHealthScore[];
  historicalTrend: { period: string; score: number }[];
  aiSummary: string;
  memberCount: number;
}

export interface TrendDay {
  day: string;
  hours: number;
  tasks: number;
  focus: number;
  sessions: number;
}

export interface TrendsResponse {
  daily: TrendDay[];
  summary: {
    totalHours: number;
    totalTasks: number;
    avgFocusTime: number;
    teamVelocity: number;
  };
}

export interface AiAlert {
  type: string;
  severity: string;
  title: string;
  message: string;
  affectedEmployees: string[];
  aiExplanation: string;
  suggestedAction: string;
  actionType: string;
}

export interface AlertsResponse {
  alerts: AiAlert[];
  total: number;
}

export async function getSupervisorAiDashboard(params: SupervisorAiQuery = {}): Promise<AiDashboardResponse> {
  const { data } = await apiClient.get<AiDashboardResponse>("/supervisor/ai/dashboard", { params });
  return data;
}

export async function getSupervisorAiLeaderboard(params: SupervisorAiQuery = {}): Promise<LeaderboardEntry[]> {
  const { data } = await apiClient.get<LeaderboardEntry[]>("/supervisor/ai/leaderboard", { params });
  return data;
}

export async function getSupervisorAiInsights(params: SupervisorAiQuery = {}): Promise<AiInsightsResponse> {
  const { data } = await apiClient.get<AiInsightsResponse>("/supervisor/ai/insights", { params });
  return data;
}

export async function getSupervisorAiRecommendations(params: SupervisorAiQuery = {}): Promise<AiRecommendationsResponse> {
  const { data } = await apiClient.get<AiRecommendationsResponse>("/supervisor/ai/recommendations", { params });
  return data;
}

export async function getSupervisorAiTeamHealth(params: SupervisorAiQuery = {}): Promise<TeamHealthResponse> {
  const { data } = await apiClient.get<TeamHealthResponse>("/supervisor/ai/team-health", { params });
  return data;
}

export async function getSupervisorAiTrends(params: SupervisorAiQuery = {}): Promise<TrendsResponse> {
  const { data } = await apiClient.get<TrendsResponse>("/supervisor/ai/trends", { params });
  return data;
}

export async function getSupervisorAiAlerts(params: SupervisorAiQuery = {}): Promise<AlertsResponse> {
  const { data } = await apiClient.get<AlertsResponse>("/supervisor/ai/alerts", { params });
  return data;
}

export async function queueSupervisorAiExport(dto: {
  format: "CSV" | "XLSX" | "PDF";
  teamId?: string;
  departmentId?: string;
  from?: string;
  to?: string;
}): Promise<{ jobId: string; status: string; message: string }> {
  const { data } = await apiClient.post("/supervisor/ai/export", dto);
  return data;
}

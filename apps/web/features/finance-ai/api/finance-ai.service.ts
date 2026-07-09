import { apiClient } from "@/lib/api/client";

export interface AiDashboardCard {
  value: number;
  previous: number;
  change: number;
}

export interface PayrollOversight {
  pendingApprovals: number;
  activeCycles: number;
  aiValidationStatus: number;
  processingHealth: number;
  complianceStatus: number;
}

export interface AiDashboardResponse {
  summaryCards: {
    payrollLiability: AiDashboardCard;
    budgetVariance: AiDashboardCard;
    aiEfficiencyGain: AiDashboardCard;
  };
  payrollOversight: PayrollOversight;
}

export interface AiAlert {
  id: string;
  type: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  message: string;
  department: string | null;
  recommendation: string;
  timestamp: string;
  status: "OPEN" | "REVIEWED" | "RESOLVED";
  metadata: Record<string, unknown> | null;
}

export interface AiAlertsResponse {
  data: AiAlert[];
  page: { nextCursor: string | null };
}

export interface ForecastPoint {
  label: string;
  value: number;
}

export interface AiForecastResponse {
  period: string;
  payrollForecast: ForecastPoint[];
  laborCostForecast: ForecastPoint[];
  budgetProjection: ForecastPoint[];
  cashFlowForecast: ForecastPoint[];
}

export interface DepartmentBudgetRow {
  departmentId: string;
  department: string;
  budget: number;
  spent: number;
  remaining: number;
  utilization: number;
  status: "ON_TRACK" | "AT_RISK" | "OVER_BUDGET";
}

export interface BudgetResponse {
  data: DepartmentBudgetRow[];
  totals: { totalBudget: number; totalSpent: number; totalRemaining: number };
  total: number;
}

export interface LiabilityResponse {
  payrollLiability: number;
  outstandingPayroll: number;
  estimatedCost: number;
  financialExposure: number;
}

export interface AiReportResponse {
  jobId: string;
  type: string;
  message: string;
}

export interface AiReportResult {
  id: string;
  status: string;
  feature: string;
  createdAt: string;
  latencyMs: number | null;
  errorMsg: string | null;
  result: {
    summary: string;
    recommendation: string;
    confidence: number;
  } | null;
}

export interface AiQuery {
  limit?: number;
  cursor?: string;
  severity?: string;
  departmentId?: string;
  status?: string;
  search?: string;
  period?: string;
  from?: string;
  to?: string;
}

export async function getAiDashboard(params?: AiQuery): Promise<AiDashboardResponse> {
  const { data } = await apiClient.get<AiDashboardResponse>("/finance-ai/dashboard", { params });
  return data;
}

export async function getAiAlerts(params?: AiQuery): Promise<AiAlertsResponse> {
  const { data } = await apiClient.get<AiAlertsResponse>("/finance-ai/alerts", { params });
  return data;
}

export async function reviewAiAlert(id: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.post(`/finance-ai/alerts/${id}/review`);
  return data;
}

export async function getAiForecast(params?: AiQuery): Promise<AiForecastResponse> {
  const { data } = await apiClient.get<AiForecastResponse>("/finance-ai/forecast", { params });
  return data;
}

export async function getAiBudget(params?: AiQuery): Promise<BudgetResponse> {
  const { data } = await apiClient.get<BudgetResponse>("/finance-ai/budget", { params });
  return data;
}

export async function getAiLiability(): Promise<LiabilityResponse> {
  const { data } = await apiClient.get<LiabilityResponse>("/finance-ai/liability");
  return data;
}

export async function generateAiReport(type?: string): Promise<AiReportResponse> {
  const params = type ? { type } : undefined;
  const { data } = await apiClient.post<AiReportResponse>("/finance-ai/report", undefined, { params });
  return data;
}

export async function getAiReport(id: string): Promise<AiReportResult> {
  const { data } = await apiClient.get<AiReportResult>(`/finance-ai/reports/${id}`);
  return data;
}

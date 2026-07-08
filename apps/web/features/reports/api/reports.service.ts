import { apiClient } from "@/lib/api/client";

export interface AuditLogItem {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  status: string;
}

export interface ReportsDashboardData {
  attendanceRate: number;
  laborCost: number;
  activeUsers: number;
  complianceScore: number;
  laborDistribution: { name: string; cost: number }[];
  auditLogs: AuditLogItem[];
}

export interface GeneratedReportItem {
  id: string;
  name: string;
  category: "ATTENDANCE" | "PAYROLL" | "TIMESHEETS" | "LABOR_COST" | "COMPLIANCE" | "DEPARTMENT_ANALYTICS";
  format: "PDF" | "CSV" | "XLSX";
  dateRange?: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  filePath?: string;
  downloadCount: number;
  createdAt: string;
  creator: { email: string; firstName: string; lastName: string };
}

export interface ReportsHistoryResponse {
  data: GeneratedReportItem[];
  page: { nextCursor: string | null };
}

export interface ReportsQuery {
  category?: string;
  userId?: string;
  departmentId?: string;
  teamId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
}

export async function getReportsDashboard(params: ReportsQuery): Promise<ReportsDashboardData> {
  const { data } = await apiClient.get<ReportsDashboardData>("/reports/dashboard", { params });
  return data;
}

export async function getReportsHistory(params: ReportsQuery): Promise<ReportsHistoryResponse> {
  const { data } = await apiClient.get<ReportsHistoryResponse>("/reports/history", { params });
  return data;
}

export async function generateReport(dto: {
  category: string;
  format: "PDF" | "CSV" | "XLSX";
  userId?: string;
  departmentId?: string;
  teamId?: string;
  from?: string;
  to?: string;
}): Promise<GeneratedReportItem> {
  const { data } = await apiClient.post<GeneratedReportItem>("/reports/generate", dto);
  return data;
}

export async function auditDownloadReport(reportId: string): Promise<GeneratedReportItem> {
  const { data } = await apiClient.post<GeneratedReportItem>("/reports/export", { reportId });
  return data;
}

export async function deleteReport(id: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<{ success: boolean }>(`/reports/${id}`);
  return data;
}

export interface TeamProductivityRow {
  userId: string;
  name: string;
  department: string;
  role: string;
  approvedHours: number;
  pendingHours: number;
  rejectedHours: number;
  payrollEstimate: number;
}

export interface TeamProductivityResponse {
  data: TeamProductivityRow[];
  page: { nextCursor: string | null };
}

export interface TeamProductivitySummary {
  totalApprovedHours: number;
  totalPendingHours: number;
  payrollLiability: number;
  changePercent: string;
}

export async function getTeamProductivity(params: ReportsQuery & { q?: string }): Promise<TeamProductivityResponse> {
  const { data } = await apiClient.get<TeamProductivityResponse>("/reports/team-productivity", { params });
  return data;
}

export async function getTeamProductivitySummary(params: ReportsQuery): Promise<TeamProductivitySummary> {
  const { data } = await apiClient.get<TeamProductivitySummary>("/reports/team-productivity/summary", { params });
  return data;
}

import { apiClient } from "@/lib/api/client";

export interface HrSummary {
  totalPayroll: number;
  activeEmployees: number;
  pendingTimesheets: number;
  aiEfficiencyScore: number;
  payrollPeriod: { startDate: string; endDate: string; status: string } | null;
}

export interface HrExecutiveSummary {
  utilization: number;
  summary: string;
  actionRecommendations: string[];
  forecastedRisk: { overtimeRisk: "LOW" | "MEDIUM" | "HIGH"; turnoverProbability: "LOW" | "MEDIUM" | "HIGH" };
  generatedAt: string;
}

export interface HrDepartmentRow {
  id: string;
  name: string;
  headcount: number;
  payrollAllocation: number;
  attendanceRate: number;
  efficiency: number;
  status: "OPTIMIZED" | "ON_TRACK" | "NEEDS_REVIEW";
}

export interface RecentAuditLog {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export interface RecentApproval {
  id: string;
  lastAction: string;
  resultingState: string;
  actedAt: string;
  supervisor: { firstName: string; lastName: string };
  timesheet: { userId: string; periodStart: string; periodEnd: string };
}

export interface RecentPayrollGeneration {
  id: string;
  createdAt: string;
  generatedBy: string;
  period: { type: string; startDate: string; endDate: string };
}

export interface RecentUserRegistration {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  createdAt: string;
}

export interface HrRecent {
  auditLogs: RecentAuditLog[];
  approvals: RecentApproval[];
  payrollGenerations: RecentPayrollGeneration[];
  userRegistrations: RecentUserRegistration[];
}

export async function getHrSummary(): Promise<HrSummary> {
  const { data } = await apiClient.get<HrSummary>("/dashboard/hr/summary");
  return data;
}

export async function getHrExecutiveSummary(): Promise<HrExecutiveSummary> {
  const { data } = await apiClient.get<HrExecutiveSummary>("/dashboard/hr/executive-summary");
  return data;
}

export async function generateHrReport(): Promise<HrExecutiveSummary> {
  const { data } = await apiClient.post<HrExecutiveSummary>("/dashboard/hr/executive-summary/generate");
  return data;
}

export async function getHrDepartments(): Promise<HrDepartmentRow[]> {
  const { data } = await apiClient.get<HrDepartmentRow[]>("/dashboard/hr/departments");
  return data;
}

export async function getHrRecent(): Promise<HrRecent> {
  const { data } = await apiClient.get<HrRecent>("/dashboard/hr/recent");
  return data;
}

/** Fetches the audited CSV export and triggers a client-side download. */
export async function exportHrReportCsv(): Promise<void> {
  const { data: blob } = await apiClient.get<Blob>("/dashboard/hr/export", { responseType: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hr-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

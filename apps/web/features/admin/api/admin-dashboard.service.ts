import { apiClient } from "@/lib/api/client";

export interface AdminOverview {
  systemHealth: "healthy" | "degraded" | "down";
  uptimeSeconds: number;
  activeUsers: number;
  organizations: number;
  pendingApprovals: number;
  payrollStatus: Record<string, number>;
  todayTimesheets: number;
  activeSessions: number;
  apiLatency: number;
  databaseLatency: number;
}

export interface AdminActivity {
  days: number;
  data: { date: string; count: number }[];
}

export interface AdminCharts {
  employeeGrowth: { month: string; newUsers: number }[];
  organizationStats: { departments: number; teams: number; projects: number; clients: number };
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

export interface AdminRecent {
  auditLogs: RecentAuditLog[];
  approvals: RecentApproval[];
  payrollGenerations: RecentPayrollGeneration[];
  userRegistrations: RecentUserRegistration[];
}

export interface AdminExportSnapshot {
  generatedAt: string;
  overview: AdminOverview;
  charts: AdminCharts;
  recent: AdminRecent;
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const { data } = await apiClient.get<AdminOverview>("/dashboard/overview");
  return data;
}

export async function getAdminActivity(days = 14): Promise<AdminActivity> {
  const { data } = await apiClient.get<AdminActivity>("/dashboard/activity", { params: { days } });
  return data;
}

export async function getAdminCharts(): Promise<AdminCharts> {
  const { data } = await apiClient.get<AdminCharts>("/dashboard/charts");
  return data;
}

export async function getAdminRecent(): Promise<AdminRecent> {
  const { data } = await apiClient.get<AdminRecent>("/dashboard/recent");
  return data;
}

/** Fetches the audited export snapshot and triggers a client-side JSON download. */
export async function exportAdminReport(): Promise<void> {
  const { data } = await apiClient.get<AdminExportSnapshot>("/dashboard/export");
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `system-overview-${data.generatedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

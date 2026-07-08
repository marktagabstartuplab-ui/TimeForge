import { apiClient } from "@/lib/api/client";
import type { Page } from "@/features/time-tracking/api/time-entries.service";

export interface PendingTimesheetRow {
  id: string;
  userId: string;
  employeeName: string;
  department: string | null;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  kpiScore: number | null;
  status: string;
  version: number;
}

export interface ScrumReviewRow {
  id: string;
  userId: string;
  employeeName: string;
  entryDate: string;
  submittedAt: string | null;
  yesterday: string;
  today: string;
  blockers: string | null;
  status: string;
  supervisorNote: string | null;
  version: number;
}

export interface TeamKpiRow {
  kpiTemplateId: string;
  name: string;
  percentage: number;
  belowTarget: boolean;
  sampleSize: number;
}

export interface ProductivitySummary {
  totalHours: number;
  attendanceRate: number;
  payrollStatus: string;
  overtimeHours: number;
  /** Dollar figure — null unless the caller has payroll:read (Finance/Admin). */
  overtimeCost: number | null;
}

export interface SupervisorDashboard {
  pendingTimesheets: { count: number; items: PendingTimesheetRow[] };
  dailyScrums: { items: ScrumReviewRow[] };
  teamKpis: { items: TeamKpiRow[]; belowTargetCount: number };
  productivity: ProductivitySummary;
}

export interface BulkApproveItem {
  timesheetId: string;
  expectedVersion: number;
}

export interface BulkApproveResult {
  results: { id: string; status: "ok" | "error"; message?: string }[];
}

export async function getSupervisorDashboard(): Promise<SupervisorDashboard> {
  const { data } = await apiClient.get<SupervisorDashboard>("/supervisor/dashboard");
  return data;
}

export async function getPendingTimesheets(params: { limit?: number; cursor?: string; status?: string } = {}): Promise<Page<PendingTimesheetRow>> {
  const { data } = await apiClient.get<Page<PendingTimesheetRow>>("/supervisor/pending-timesheets", { params });
  return data;
}

export async function getDailyScrums(limit = 20): Promise<ScrumReviewRow[]> {
  const { data } = await apiClient.get<ScrumReviewRow[]>("/supervisor/daily-scrums", { params: { limit } });
  return data;
}

export async function getTeamKpis(kpiTemplateId?: string): Promise<TeamKpiRow[]> {
  const { data } = await apiClient.get<TeamKpiRow[]>("/supervisor/team-kpis", { params: { kpiTemplateId } });
  return data;
}

export async function getProductivitySummary(params: { from?: string; to?: string } = {}): Promise<ProductivitySummary> {
  const { data } = await apiClient.get<ProductivitySummary>("/supervisor/productivity-summary", { params });
  return data;
}

export async function bulkApproveTimesheets(items: BulkApproveItem[]): Promise<BulkApproveResult> {
  const { data } = await apiClient.post<BulkApproveResult>("/supervisor/bulk-approve", { items });
  return data;
}

export interface DecisionPayload {
  action: "APPROVE" | "REJECT" | "REQUEST_REVISION";
  remark?: string;
  expectedVersion: number;
}

/** Single-timesheet decision — the existing sole approval-decision path (see ApprovalsService.decide). */
export async function decideTimesheet(timesheetId: string, dto: DecisionPayload): Promise<{ id: string; status: string }> {
  const { data } = await apiClient.post(`/approvals/${timesheetId}/decision`, dto);
  return data;
}

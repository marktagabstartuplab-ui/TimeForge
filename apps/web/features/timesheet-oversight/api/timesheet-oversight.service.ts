import { apiClient } from "@/lib/api/client";
import type { Page } from "@/features/time-tracking/api/time-entries.service";
import type { Timesheet } from "@/features/timesheets/api/timesheets.service";

export interface TimesheetRow extends Timesheet {
  user: { firstName: string; lastName: string; department: { name: string } | null };
}

export interface TimesheetOversightQuery {
  status?: string;
  departmentId?: string;
  search?: string;
  from?: string;
  to?: string;
  sortBy?: "periodStart" | "totalMinutes" | "status" | "submittedAt";
  sortDir?: "asc" | "desc";
  cursor?: string;
  limit?: number;
}

export interface TimesheetStats {
  totalTimesheets: number;
  completionRate: number;
  pendingApproval: number;
  flaggedEntries: number;
  overdueCount: number;
  overtimeCount: number;
  byStatus: Record<string, number>;
}

export interface TimesheetChart {
  weeklySubmissions: { week: string; count: number }[];
  monthlyTrend: { month: string; count: number }[];
}

export interface BulkResult {
  results: { id: string; status: "ok" | "error"; error?: string }[];
}

export async function listOversightTimesheets(query: TimesheetOversightQuery = {}): Promise<Page<TimesheetRow>> {
  const { data } = await apiClient.get<Page<TimesheetRow>>("/timesheets", { params: query });
  return data;
}

export async function getTimesheetStats(params: { departmentId?: string; from?: string; to?: string } = {}): Promise<TimesheetStats> {
  const { data } = await apiClient.get<TimesheetStats>("/timesheets/stats", { params });
  return data;
}

export async function getTimesheetChart(params: { weeks?: number; months?: number } = {}): Promise<TimesheetChart> {
  const { data } = await apiClient.get<TimesheetChart>("/timesheets/chart", { params });
  return data;
}

export async function bulkApproveTimesheets(items: { timesheetId: string; expectedVersion: number }[]): Promise<BulkResult> {
  const { data } = await apiClient.post<BulkResult>("/timesheets/bulk-approve", { items });
  return data;
}

export async function bulkRejectTimesheets(
  items: { timesheetId: string; expectedVersion: number }[],
  remark: string,
): Promise<BulkResult> {
  const { data } = await apiClient.post<BulkResult>("/timesheets/bulk-reject", { items, remark });
  return data;
}

export interface TimesheetDetail extends TimesheetRow {
  entries: {
    id: string;
    startTime: string;
    endTime: string | null;
    durationMinutes: number | null;
    projectId: string | null;
    workCategoryId: string | null;
    description: string | null;
    deliverables: string | null;
  }[];
  approvals: {
    id: string;
    action: string;
    remark: string | null;
    createdAt: string;
    supervisor: {
      firstName: string;
      lastName: string;
    };
  }[];
}

export async function getPendingTimesheets(query: TimesheetOversightQuery = {}): Promise<Page<TimesheetRow>> {
  const { data } = await apiClient.get<Page<TimesheetRow>>("/timesheets/pending", { params: query });
  return data;
}

export async function getTimesheetDetail(id: string): Promise<TimesheetDetail> {
  const { data } = await apiClient.get<TimesheetDetail>(`/timesheets/${id}`);
  return data;
}

export async function approveTimesheet(id: string, payload: { expectedVersion: number; remark?: string }): Promise<void> {
  await apiClient.post(`/timesheets/${id}/approve`, payload);
}

export async function rejectTimesheet(id: string, payload: { expectedVersion: number; remark: string }): Promise<void> {
  await apiClient.post(`/timesheets/${id}/reject`, payload);
}

export async function requestRevisionTimesheet(id: string, payload: { expectedVersion: number; remark: string }): Promise<void> {
  await apiClient.post(`/timesheets/${id}/request-revision`, payload);
}

/** Client-side CSV export of the currently-loaded rows — no server round trip needed. */
export function exportTimesheetsCsv(rows: TimesheetRow[]): void {
  const header = "Employee,Department,Period Start,Period End,Total Hours,Status";
  const lines = rows.map((r) =>
    [
      `"${r.user.firstName} ${r.user.lastName}"`,
      `"${r.user.department?.name ?? ""}"`,
      r.periodStart.slice(0, 10),
      r.periodEnd.slice(0, 10),
      (r.totalMinutes / 60).toFixed(2),
      r.status,
    ].join(","),
  );
  const csv = [header, ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `timesheet-oversight-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

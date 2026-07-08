import { apiClient } from "@/lib/api/client";
import type { Page } from "@/features/time-tracking/api/time-entries.service";

export type TimesheetStatus =
  | "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED"
  | "REVISION_REQUESTED" | "PAYROLL_READY";

export interface HRTimesheetRow {
  id: string;
  userId: string;
  employee: string;
  department: string | null;
  periodStart: string;
  periodEnd: string;
  totalMinutes: number;
  totalHours: number;
  status: TimesheetStatus;
  summary: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  entriesCount: number;
  supervisorRemark: string | null;
  supervisorName: string | null;
  lastAction: string | null;
  actedAt: string | null;
}

export interface HRTimesheetStats {
  totalEmployees: number;
  hoursLogged: number;
  pendingApproval: number;
  flaggedRemarks: number;
  totalTimesheets: number;
}

export interface HRTimesheetQuery {
  search?: string;
  departmentId?: string;
  status?: string;
  from?: string;
  to?: string;
  sortBy?: string;
  sortDir?: string;
  cursor?: string;
  limit?: number;
}

export async function listHRTimesheets(query: HRTimesheetQuery = {}): Promise<Page<HRTimesheetRow>> {
  const { data } = await apiClient.get<Page<HRTimesheetRow>>("/timesheets/hr", { params: query });
  return data;
}

export async function getHRTimesheetStats(query: { departmentId?: string; from?: string; to?: string } = {}): Promise<HRTimesheetStats> {
  const { data } = await apiClient.get<HRTimesheetStats>("/timesheets/hr/stats", { params: query });
  return data;
}

async function downloadExport(url: string, filename: string): Promise<void> {
  const { data: blob } = await apiClient.get<Blob>(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function exportHRTimesheetsCsv(query: HRTimesheetQuery = {}): Promise<void> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)); });
  await downloadExport(`/timesheets/hr/export/csv?${params.toString()}`, `hr-timesheets-${new Date().toISOString().slice(0, 10)}.csv`);
}

export async function exportHRTimesheetsExcel(query: HRTimesheetQuery = {}): Promise<void> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)); });
  await downloadExport(`/timesheets/hr/export/excel?${params.toString()}`, `hr-timesheets-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportHRTimesheetsPdf(query: HRTimesheetQuery = {}): Promise<void> {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)); });
  await downloadExport(`/timesheets/hr/export/pdf?${params.toString()}`, `hr-timesheets-${new Date().toISOString().slice(0, 10)}.pdf`);
}

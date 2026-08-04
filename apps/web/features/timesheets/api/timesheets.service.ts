import { apiClient } from "@/lib/api/client";
import type { Page, TimeEntry } from "@/features/time-tracking/api/time-entries.service";

export type TimesheetStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "REVISION_REQUESTED"
  | "PAYROLL_READY";

export type TimesheetPaymentStatus = "UNPAID" | "PROCESSING" | "PAID";

export interface Timesheet {
  id: string;
  userId: string;
  status: TimesheetStatus;
  paymentStatus?: TimesheetPaymentStatus;
  periodStart: string;
  periodEnd: string;
  totalMinutes: number;
  summary: string | null;
  version: number;
}

export interface TimesheetApproval {
  id: string;
  lastAction: string;
  resultingState: TimesheetStatus;
  remark: string | null;
  actedAt: string;
  supervisor: { firstName: string; lastName: string } | null;
}

export interface TimesheetKpiProgress {
  id: string;
  kpiTemplateId: string;
  userId: string;
  periodKey: string;
  currentValue: number;
  targetValue: number;
  kpiTemplate: {
    name: string;
    metricType: string;
    period: string;
    unit: string | null;
  };
}

export interface TimesheetDetail extends Timesheet {
  /** Newest first — approvals[0] is the action that produced the current status. */
  approvals: TimesheetApproval[];
  kpiProgress?: TimesheetKpiProgress[];
  entries: (TimeEntry & {
    project?: { name: string } | null;
    client?: { name: string } | null;
    department?: { name: string } | null;
  })[];
}

export async function listTimesheets(params: { status?: string; from?: string; to?: string; limit?: number; userId?: string } = {}): Promise<Page<Timesheet>> {
  const { data } = await apiClient.get<Page<Timesheet>>("/timesheets", { params });
  return data;
}

/** Fetches a single timesheet with its approval history (supervisor remarks). */
export async function getTimesheetDetail(id: string): Promise<TimesheetDetail> {
  const { data } = await apiClient.get<TimesheetDetail>(`/timesheets/${id}`);
  return data;
}

export async function createTimesheet(payload: { periodStart: string; periodEnd: string; summary?: string }): Promise<Timesheet> {
  const { data } = await apiClient.post<Timesheet>("/timesheets", payload);
  return data;
}

export async function updateTimesheet(id: string, payload: { summary?: string; version: number }): Promise<Timesheet> {
  const { data } = await apiClient.patch<Timesheet>(`/timesheets/${id}`, payload);
  return data;
}

export async function attachEntries(id: string, entryIds: string[]): Promise<Timesheet> {
  const { data } = await apiClient.post<Timesheet>(`/timesheets/${id}/entries`, { entryIds });
  return data;
}

export async function submitTimesheet(id: string, payload: { summary?: string; version: number }): Promise<Timesheet> {
  const { data } = await apiClient.post<Timesheet>(`/timesheets/${id}/submit`, payload);
  return data;
}

/** Fetches the timesheet PDF export file and triggers a client-side download. */
export async function downloadTimesheetPdf(id: string): Promise<void> {
  const { data: blob } = await apiClient.get<Blob>(`/timesheets/${id}/export/pdf`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `timesheet-${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

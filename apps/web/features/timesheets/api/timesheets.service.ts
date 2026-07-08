import { apiClient } from "@/lib/api/client";
import type { Page } from "@/features/time-tracking/api/time-entries.service";

export type TimesheetStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "REVISION_REQUESTED"
  | "PAYROLL_READY";

export interface Timesheet {
  id: string;
  userId: string;
  status: TimesheetStatus;
  periodStart: string;
  periodEnd: string;
  totalMinutes: number;
  summary: string | null;
  version: number;
}

export async function listTimesheets(params: { status?: string; from?: string; to?: string; limit?: number } = {}): Promise<Page<Timesheet>> {
  const { data } = await apiClient.get<Page<Timesheet>>("/timesheets", { params });
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

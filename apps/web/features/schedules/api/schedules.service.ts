import { apiClient } from "@/lib/api/client";
import type { Page } from "@/features/time-tracking/api/time-entries.service";

export type ShiftStatus = "DRAFT" | "PUBLISHED";
export type ShiftType = "MORNING" | "AFTERNOON" | "NIGHT" | "CUSTOM";

export interface ShiftRow {
  id: string;
  userId: string;
  departmentId: string | null;
  shiftDate: string;
  startTime: string;
  endTime: string;
  shiftType: ShiftType;
  status: ShiftStatus;
  notes: string | null;
  version: number;
}

export interface CalendarEmployee {
  userId: string;
  name: string;
  department: string | null;
  shifts: (Omit<ShiftRow, "userId" | "departmentId"> & { conflict: boolean })[];
}

export interface CalendarSummary {
  activeShifts: number;
  openShifts: number;
  pendingRequests: number;
  scheduledHours: number;
}

export interface EfficiencyDay {
  date: string;
  scheduledHours: number;
  workedHours: number;
}

export interface ScheduleCalendar {
  weekStart: string;
  weekEnd: string;
  summary: CalendarSummary;
  employees: CalendarEmployee[];
  efficiency: EfficiencyDay[];
}

export interface ScheduleConflict {
  shiftAId: string;
  shiftBId: string;
  userId: string;
  employeeName: string;
  overlapStart: string;
  overlapEnd: string;
}

export interface PendingRequestRow extends ShiftRow {
  user: { firstName: string; lastName: string };
  department: { name: string } | null;
}

export interface CreateShiftPayload {
  userId: string;
  departmentId?: string;
  shiftDate: string;
  startTime: string;
  endTime: string;
  shiftType?: ShiftType;
  notes?: string;
  publish?: "true" | "false";
}

export interface UpdateShiftPayload {
  departmentId?: string;
  shiftDate?: string;
  startTime?: string;
  endTime?: string;
  shiftType?: ShiftType;
  notes?: string;
  status?: ShiftStatus;
  version: number;
}

export async function getCalendar(params: { weekStart?: string; departmentId?: string; userId?: string } = {}): Promise<ScheduleCalendar> {
  const { data } = await apiClient.get<ScheduleCalendar>("/schedules/calendar", { params });
  return data;
}

export async function getConflicts(params: { from?: string; to?: string } = {}): Promise<ScheduleConflict[]> {
  const { data } = await apiClient.get<ScheduleConflict[]>("/schedules/conflicts", { params });
  return data;
}

export async function getRequests(params: { limit?: number } = {}): Promise<Page<PendingRequestRow>> {
  const { data } = await apiClient.get<Page<PendingRequestRow>>("/schedules/requests", { params });
  return data;
}

export async function createShift(payload: CreateShiftPayload): Promise<ShiftRow> {
  const { data } = await apiClient.post<ShiftRow>("/schedules", payload);
  return data;
}

export async function createShiftDraft(payload: CreateShiftPayload): Promise<ShiftRow> {
  const { data } = await apiClient.post<ShiftRow>("/schedules/draft", payload);
  return data;
}

export async function updateShift(id: string, payload: UpdateShiftPayload): Promise<ShiftRow> {
  const { data } = await apiClient.patch<ShiftRow>(`/schedules/${id}`, payload);
  return data;
}

export async function deleteShift(id: string, version: number): Promise<void> {
  await apiClient.delete(`/schedules/${id}`, { params: { version } });
}

// ── Employee Personal Calendar Events ──────────────────────────────────────────

export type EmployeeCalendarEventType = 'REMINDER' | 'APPOINTMENT' | 'LEAVE_REQUEST';

export interface EmployeeCalendarEvent {
  id: string;
  userId: string;
  title: string;
  eventType: EmployeeCalendarEventType;
  /** ISO date string YYYY-MM-DD */
  eventDate: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCalendarEventPayload {
  title: string;
  eventType: EmployeeCalendarEventType;
  eventDate: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
}

export interface UpdateCalendarEventPayload {
  title?: string;
  eventType?: EmployeeCalendarEventType;
  eventDate?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  version: number;
}

export async function getCalendarEvents(params: { from: string; to: string }): Promise<EmployeeCalendarEvent[]> {
  const { data } = await apiClient.get<EmployeeCalendarEvent[]>('/calendar-events', { params });
  return data;
}

export async function createCalendarEvent(payload: CreateCalendarEventPayload): Promise<EmployeeCalendarEvent> {
  const { data } = await apiClient.post<EmployeeCalendarEvent>('/calendar-events', payload);
  return data;
}

export async function updateCalendarEvent(id: string, payload: UpdateCalendarEventPayload): Promise<EmployeeCalendarEvent> {
  const { data } = await apiClient.patch<EmployeeCalendarEvent>(`/calendar-events/${id}`, payload);
  return data;
}

export async function deleteCalendarEvent(id: string, version: number): Promise<void> {
  await apiClient.delete(`/calendar-events/${id}`, { params: { version } });
}


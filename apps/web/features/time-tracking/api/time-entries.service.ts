import { apiClient } from "@/lib/api/client";

export interface PageMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Page<T> {
  data: T[];
  page: PageMeta;
}

export interface TimeEntry {
  id: string;
  userId: string;
  timesheetId: string | null;
  projectId: string | null;
  clientId: string | null;
  workCategoryId: string | null;
  source: "MANUAL" | "TIMER";
  startTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  description: string | null;
  referenceLinks?: string[];
  version: number;
}

export interface TimeEntryQuery {
  from?: string;
  to?: string;
  running?: boolean;
  limit?: number;
  cursor?: string;
}

export interface CreateTimeEntryPayload {
  startTime: string;
  endTime?: string;
  projectId?: string;
  clientId?: string;
  workCategoryId?: string;
  description?: string;
  referenceLinks?: string[];
}

export interface StartTimerPayload {
  projectId?: string;
  clientId?: string;
  workCategoryId?: string;
  description?: string;
}

export async function listTimeEntries(query: TimeEntryQuery = {}): Promise<Page<TimeEntry>> {
  const { data } = await apiClient.get<Page<TimeEntry>>("/time-entries", {
    params: {
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      ...(query.running ? { running: "true" } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
    },
  });
  return data;
}

export async function createTimeEntry(payload: CreateTimeEntryPayload): Promise<TimeEntry> {
  const { data } = await apiClient.post<TimeEntry>("/time-entries", payload);
  return data;
}

export async function startTimer(payload: StartTimerPayload = {}): Promise<TimeEntry> {
  const { data } = await apiClient.post<TimeEntry>("/time-entries/start", payload);
  return data;
}

export async function stopTimer(id: string): Promise<TimeEntry> {
  const { data } = await apiClient.post<TimeEntry>(`/time-entries/${id}/stop`);
  return data;
}

export async function deleteTimeEntry(id: string, version: number): Promise<void> {
  await apiClient.delete(`/time-entries/${id}`, { params: { version } });
}

import { apiClient } from "@/lib/api/client";

export interface PageMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
  total?: number;
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

/**
 * Fetches every entry in a range by following cursor pagination (the API
 * caps `limit` per page). Hard-capped at 10 pages / 1000 entries as a
 * safety valve for pathological ranges.
 */
export async function listAllTimeEntries(
  query: Omit<TimeEntryQuery, "cursor"> = {},
): Promise<TimeEntry[]> {
  const all: TimeEntry[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 10; i++) {
    const page = await listTimeEntries({ ...query, limit: query.limit ?? 100, cursor });
    all.push(...page.data);
    if (!page.page.hasMore || !page.page.nextCursor) break;
    cursor = page.page.nextCursor;
  }
  return all;
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

export interface UpdateTimeEntryPayload {
  startTime?: string;
  endTime?: string;
  projectId?: string;
  clientId?: string;
  workCategoryId?: string;
  description?: string;
  referenceLinks?: string[];
  /** Optimistic-lock version — required by UpdateTimeEntryDto. */
  version: number;
}

export async function updateTimeEntry(id: string, payload: UpdateTimeEntryPayload): Promise<TimeEntry> {
  const { data } = await apiClient.patch<TimeEntry>(`/time-entries/${id}`, payload);
  return data;
}

export async function deleteTimeEntry(id: string, version: number): Promise<void> {
  await apiClient.delete(`/time-entries/${id}`, { params: { version } });
}

import { apiClient } from "@/lib/api/client";

export type SessionEventType = "CLOCK_IN" | "BREAK_START" | "BREAK_END" | "TASK_COMPLETED" | "CLOCK_OUT";

export interface WorkSession {
  id: string;
  userId: string;
  workDate: string;
  clockIn: string;
  clockOut: string | null;
  isActive: boolean;
  currentBreakStartedAt: string | null;
  breakCount: number;
  breakMinutes: number;
  sessionDurationMinutes: number | null;
  version: number;
}

export interface WorkSessionSummary {
  session: WorkSession | null;
  onBreak: boolean;
  runningEntryId: string | null;
  workedMinutes: number;
}

export interface SessionEvent {
  id: string;
  workSessionId: string;
  eventType: SessionEventType;
  metadata: unknown;
  occurredAt: string;
}

export interface ClockInPayload {
  projectId?: string;
  clientId?: string;
  workCategoryId?: string;
  description?: string;
}

export async function getCurrentWorkSession(): Promise<WorkSessionSummary> {
  const { data } = await apiClient.get<WorkSessionSummary>("/work-sessions/current");
  return data;
}

export async function clockInSession(payload: ClockInPayload = {}): Promise<WorkSessionSummary> {
  const { data } = await apiClient.post<WorkSessionSummary>("/work-sessions/clock-in", payload);
  return data;
}

export async function startBreak(): Promise<WorkSessionSummary> {
  const { data } = await apiClient.post<WorkSessionSummary>("/work-sessions/break/start");
  return data;
}

export async function endBreak(): Promise<WorkSessionSummary> {
  const { data } = await apiClient.post<WorkSessionSummary>("/work-sessions/break/end");
  return data;
}

export async function clockOutSession(): Promise<WorkSessionSummary> {
  const { data } = await apiClient.post<WorkSessionSummary>("/work-sessions/clock-out");
  return data;
}

export async function getWorkSessionEvents(sessionId: string): Promise<SessionEvent[]> {
  const { data } = await apiClient.get<SessionEvent[]>(`/work-sessions/${sessionId}/events`);
  return data;
}

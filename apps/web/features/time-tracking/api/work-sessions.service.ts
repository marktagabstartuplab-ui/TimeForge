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

export type ShiftLimitState = "UNLIMITED" | "OK" | "WARNING" | "LIMIT_REACHED" | "EXPIRED";

export interface ShiftLimitStatus {
  state: ShiftLimitState;
  /** Minutes since clock-in, wall clock (breaks included). */
  elapsedMinutes: number;
  maxShiftMinutes: number | null;
  /** Negative once past the deadline. */
  remainingMinutes: number | null;
  maxClockOutAt: string | null;
  pendingOverrideId: string | null;
  requiresSupervisorOverride: boolean;
}

/**
 * BUG-BX — the whole day across every session. `workedMinutes` on the summary
 * is the *current session*; these are the cumulative figures that decide
 * whether Time In is offered again after a split shift.
 */
export interface DailyTotals {
  /** Worked minutes across every session today, breaks excluded. */
  workedMinutes: number;
  /** The org's daily ceiling in minutes; null when no shift config applies. */
  maxDailyMinutes: number | null;
  /** Null when unlimited; never negative. */
  remainingMinutes: number | null;
  canClockIn: boolean;
  /** Why Time In is unavailable — shown as the button's tooltip. */
  blockedReason: string | null;
}

export interface WorkSessionSummary {
  session: WorkSession | null;
  onBreak: boolean;
  runningEntryId: string | null;
  /** This session only. For the day across all sessions see `dailyTotals`. */
  workedMinutes: number;
  /** Null when there is no active session or the org sets no shift limit. */
  shiftLimit: ShiftLimitStatus | null;
  dailyTotals: DailyTotals;
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

/** BUG-BW — one day of immutable clock events, oldest first. */
export interface DailyLog {
  /** The requested day, YYYY-MM-DD. */
  date: string;
  events: SessionEvent[];
}

/** @param date organization-local calendar day, YYYY-MM-DD. */
export async function getDailyLog(date: string): Promise<DailyLog> {
  const { data } = await apiClient.get<DailyLog>(`/work-sessions/daily-log/${date}`, {
    params: { _t: Date.now() },
  });
  return data;
}

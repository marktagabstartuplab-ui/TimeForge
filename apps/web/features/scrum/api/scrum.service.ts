import { apiClient } from "@/lib/api/client";
import type { Page } from "@/features/time-tracking/api/time-entries.service";

export type ScrumTaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";

export interface ScrumEntry {
  id: string;
  userId: string;
  entryDate: string;
  yesterday: string;
  /** Legacy JSON-encoded task list — superseded by /tasks; kept for backward compatibility. */
  today: string;
  /** Legacy JSON-encoded blocker list — superseded by /blockers; kept for backward compatibility. */
  blockers: string | null;
  notes: string | null;
  /** Supervisor's feedback on this entry, shown read-only to the employee. */
  supervisorNote: string | null;
  /** Set once the employee dismissed the comment — hidden from the active dashboard, still shown in history. */
  supervisorNoteDismissedAt: string | null;
  /** Server-computed task progress for the day, 0–100. */
  progress: number;
  status: ScrumTaskStatus;
  /** True once progress reaches 100% — the day is locked and read-only. */
  isLocked: boolean;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export type ScrumTaskItemStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export type ScrumTaskPriority = "LOW" | "MEDIUM" | "HIGH";
export type BlockerSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type BlockerStatus = "OPEN" | "RESOLVED";

export interface ScrumTask {
  id: string;
  scrumEntryId: string;
  employeeId: string;
  title: string;
  description: string | null;
  expectedOutput: string;
  measurement: string;
  projectId: string | null;
  taskStatus: ScrumTaskItemStatus;
  completedAt: string | null;
  estimatedHours: string | null;
  actualHours: string | null;
  priority: ScrumTaskPriority;
  kpi: string | null;
  plannedTarget: string | null;
  actualCompleted: string | null;
  continueTomorrow: boolean | null;
  notCompletedReason: string | null;
  kpiTemplateId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateScrumTaskPayload {
  title: string;
  description?: string;
  /** BUG-BH: optional — an ad-hoc task added mid-shift was never planned. */
  expectedOutput?: string;
  measurement?: string;
  projectId?: string;
  /** BUG-BH: lets an already-finished ad-hoc task be created COMPLETED. */
  taskStatus?: ScrumTaskItemStatus;
  priority?: ScrumTaskPriority;
  kpi?: string;
  plannedTarget?: string;
  actualCompleted?: string;
  kpiTemplateId?: string;
  estimatedHours?: number;
}

export interface UpdateScrumTaskPayload {
  title?: string;
  description?: string;
  expectedOutput?: string;
  measurement?: string;
  projectId?: string;
  taskStatus?: ScrumTaskItemStatus;
  priority?: ScrumTaskPriority;
  kpi?: string;
  plannedTarget?: string;
  actualCompleted?: string;
  continueTomorrow?: boolean;
  notCompletedReason?: string;
  /** null explicitly clears an existing template link (switching to custom); omit to leave unchanged. */
  kpiTemplateId?: string | null;
  estimatedHours?: number;
  actualHours?: number;
  version: number;
}

export interface ScrumBlocker {
  id: string;
  scrumEntryId: string;
  title: string;
  description: string | null;
  severity: BlockerSeverity;
  status: BlockerStatus;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateScrumBlockerPayload {
  title: string;
  description?: string;
  severity?: BlockerSeverity;
}

export interface UpdateScrumBlockerPayload {
  title?: string;
  description?: string;
  severity?: BlockerSeverity;
  status?: BlockerStatus;
  version: number;
}

export interface CreateScrumEntryPayload {
  entryDate: string;
  yesterday: string;
  today: string;
  blockers?: string;
  notes?: string;
  progress?: number;
  status?: ScrumTaskStatus;
}

export interface UpdateScrumEntryPayload {
  yesterday?: string;
  today?: string;
  blockers?: string;
  notes?: string;
  progress?: number;
  status?: ScrumTaskStatus;
  version: number;
}

export async function listScrumEntries(params: { from?: string; to?: string; limit?: number } = {}): Promise<Page<ScrumEntry>> {
  const { data } = await apiClient.get<Page<ScrumEntry>>("/scrum-entries", { 
    params: { ...params, _t: Date.now() } 
  });
  return data;
}

export type ScrumEditRequestStatus = "PENDING" | "APPROVED" | "DECLINED";

/** An employee's request to have their locked Daily Scrum reopened. */
export interface ScrumEditRequest {
  id: string;
  scrumEntryId: string;
  requesterId: string;
  reason: string;
  status: ScrumEditRequestStatus;
  resolvedById: string | null;
  resolvedAt: string | null;
  /** Supervisor's note when declining. */
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export async function requestScrumEdit(entryId: string, reason: string): Promise<ScrumEditRequest> {
  const { data } = await apiClient.post<ScrumEditRequest>(`/scrum-entries/${entryId}/edit-request`, { reason });
  return data;
}

/** The caller's own latest request for an entry — null when they've never asked. */
export async function getMyScrumEditRequest(entryId: string): Promise<ScrumEditRequest | null> {
  const { data } = await apiClient.get<ScrumEditRequest | null>(`/scrum-entries/${entryId}/edit-request`, {
    params: { _t: Date.now() },
  });
  return data;
}

/** Uncompleted tasks carried over from a previous day's EOD ("continue tomorrow" = Yes). */
export interface ScrumCarryOver {
  sourceEntryId: string | null;
  /** YYYY-MM-DD of the day these tasks were planned on. */
  sourceDate: string | null;
  tasks: ScrumTask[];
}

export async function getScrumCarryOver(): Promise<ScrumCarryOver> {
  const { data } = await apiClient.get<ScrumCarryOver>("/scrum-entries/carry-over", {
    params: { _t: Date.now() },
  });
  return data;
}

export async function getScrumEntry(id: string): Promise<ScrumEntry> {
  const { data } = await apiClient.get<ScrumEntry>(`/scrum-entries/${id}`, {
    params: { _t: Date.now() }
  });
  return data;
}

export async function createScrumEntry(payload: CreateScrumEntryPayload): Promise<ScrumEntry> {
  const { data } = await apiClient.post<ScrumEntry>("/scrum-entries", payload);
  return data;
}

export async function updateScrumEntry(id: string, payload: UpdateScrumEntryPayload): Promise<ScrumEntry> {
  const { data } = await apiClient.patch<ScrumEntry>(`/scrum-entries/${id}`, payload);
  return data;
}

/**
 * Employee closes a revision on an entry their supervisor reopened: saves are
 * done, lock it again (BUG-AQ).
 */
export async function resubmitScrumEntry(id: string): Promise<ScrumEntry> {
  const { data } = await apiClient.post<ScrumEntry>(`/scrum-entries/${id}/resubmit`, {});
  return data;
}

/** Employee hides a supervisor comment from their active dashboard (BUG-AR). */
export async function dismissSupervisorComment(id: string): Promise<ScrumEntry> {
  const { data } = await apiClient.post<ScrumEntry>(`/scrum-entries/${id}/comment/dismiss`, {});
  return data;
}

/** Supervisor removes their own comment entirely, history included (BUG-AR). */
export async function deleteSupervisorComment(id: string): Promise<ScrumEntry> {
  const { data } = await apiClient.delete<ScrumEntry>(`/scrum/${id}/comment`);
  return data;
}

/** Supervisor feedback on a team member's scrum entry — stored as ScrumEntry.supervisorNote. */
export async function commentOnScrumEntry(id: string, comment: string, version: number): Promise<ScrumEntry> {
  const { data } = await apiClient.post<ScrumEntry>(`/scrum-entries/${id}/comment`, { comment, version });
  return data;
}

// ── Scrum Tasks ────────────────────────────────────────────────────────────────

export async function listScrumTasks(entryId: string): Promise<ScrumTask[]> {
  const { data } = await apiClient.get<ScrumTask[]>(`/scrum-entries/${entryId}/tasks`);
  return data;
}

export async function createScrumTask(entryId: string, payload: CreateScrumTaskPayload): Promise<ScrumTask> {
  const { data } = await apiClient.post<ScrumTask>(`/scrum-entries/${entryId}/tasks`, payload);
  return data;
}

export async function updateScrumTask(taskId: string, payload: UpdateScrumTaskPayload): Promise<ScrumTask> {
  const { data } = await apiClient.patch<ScrumTask>(`/scrum-entries/tasks/${taskId}`, payload);
  return data;
}

export async function completeScrumTask(taskId: string, version: number): Promise<ScrumTask> {
  const { data } = await apiClient.post<ScrumTask>(`/scrum-entries/tasks/${taskId}/complete`, { version });
  return data;
}

export async function deleteScrumTask(taskId: string, version: number): Promise<void> {
  await apiClient.delete(`/scrum-entries/tasks/${taskId}`, { params: { version } });
}

// ── Scrum Blockers ─────────────────────────────────────────────────────────────

export async function listScrumBlockers(entryId: string): Promise<ScrumBlocker[]> {
  const { data } = await apiClient.get<ScrumBlocker[]>(`/scrum-entries/${entryId}/blockers`);
  return data;
}

export async function createScrumBlocker(entryId: string, payload: CreateScrumBlockerPayload): Promise<ScrumBlocker> {
  const { data } = await apiClient.post<ScrumBlocker>(`/scrum-entries/${entryId}/blockers`, payload);
  return data;
}

export async function updateScrumBlocker(blockerId: string, payload: UpdateScrumBlockerPayload): Promise<ScrumBlocker> {
  const { data } = await apiClient.patch<ScrumBlocker>(`/scrum-entries/blockers/${blockerId}`, payload);
  return data;
}

export async function resolveScrumBlocker(blockerId: string, version: number): Promise<ScrumBlocker> {
  const { data } = await apiClient.post<ScrumBlocker>(`/scrum-entries/blockers/${blockerId}/resolve`, { version });
  return data;
}

export async function deleteScrumBlocker(blockerId: string, version: number): Promise<void> {
  await apiClient.delete(`/scrum-entries/blockers/${blockerId}`, { params: { version } });
}

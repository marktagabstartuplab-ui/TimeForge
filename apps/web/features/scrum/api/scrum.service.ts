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
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface CreateScrumTaskPayload {
  title: string;
  description?: string;
  expectedOutput: string;
  measurement: string;
  projectId?: string;
  priority?: ScrumTaskPriority;
  kpi?: string;
  plannedTarget?: string;
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
  const { data } = await apiClient.get<Page<ScrumEntry>>("/scrum-entries", { params });
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

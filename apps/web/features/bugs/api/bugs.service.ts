import { apiClient } from "@/lib/api/client";

export type BugStatus = "OPEN" | "IN_PROGRESS" | "FIXED" | "CLOSED" | "BLOCKED";
export type BugPriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type BugSeverity = "P0" | "P1" | "P2" | "P3" | "P4";

export interface BugUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarKey: string | null;
}

export interface BugAttachment {
  id: string;
  bugId: string;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  uploadedBy: string;
  createdAt: string;
}

export interface BugComment {
  id: string;
  bugId: string;
  userId: string;
  comment: string;
  createdAt: string;
  user?: BugUser | null;
}

export interface BugActivityEntry {
  id: string;
  bugId: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  changedBy: string;
  createdAt: string;
  actor?: BugUser | null;
  /** Display-ready values — ASSIGNED rows resolve user ids to names server-side. */
  oldLabel: string | null;
  newLabel: string | null;
}

export interface Bug {
  id: string;
  title: string;
  issue: string;
  whoAffected: string;
  whatISee: string;
  expected: string;
  errorMessage: string | null;
  whereItHappens: string;
  status: BugStatus;
  priority: BugPriority;
  severity: BugSeverity;
  reportedBy: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  version: number;
  reporter?: BugUser | null;
  assignee?: BugUser | null;
  attachments?: BugAttachment[];
  comments?: BugComment[];
  _count?: { comments: number; attachments: number };
}

export interface BugStats {
  total: number;
  open: number;
  inProgress: number;
  fixed: number;
  closed: number;
  blocked: number;
  critical: number;
  unassigned: number;
}

export interface Page<T> {
  data: T[];
  page: { limit: number; nextCursor: string | null; hasMore: boolean };
}

export interface CreateBugPayload {
  title: string;
  issue: string;
  whoAffected: string;
  whatISee: string;
  expected: string;
  errorMessage?: string;
  whereItHappens: string;
  severity?: BugSeverity;
}

export interface BugQuery {
  scope?: "self" | "team" | "org";
  status?: BugStatus | "";
  priority?: BugPriority | "";
  severity?: BugSeverity | "";
  assignedTo?: string;
  reportedBy?: string;
  search?: string;
  limit?: number;
  cursor?: string;
}

export interface UpdateBugPayload {
  status?: BugStatus;
  priority?: BugPriority;
  severity?: BugSeverity;
  assignedTo?: string | null;
}

export async function listBugs(query: BugQuery = {}): Promise<Page<Bug>> {
  const { data } = await apiClient.get<Page<Bug>>("/bugs", {
    params: Object.fromEntries(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== "" && v !== null),
    ),
  });
  return data;
}

export async function getBugStats(): Promise<BugStats> {
  const { data } = await apiClient.get<BugStats>("/bugs/stats");
  return data;
}

export async function getBug(id: string): Promise<Bug> {
  const { data } = await apiClient.get<Bug>(`/bugs/${id}`);
  return data;
}

export async function getBugActivity(id: string): Promise<BugActivityEntry[]> {
  const { data } = await apiClient.get<BugActivityEntry[]>(`/bugs/${id}/activity`);
  return data;
}

export async function createBug(payload: CreateBugPayload): Promise<Bug> {
  const { data } = await apiClient.post<Bug>("/bugs", payload);
  return data;
}

export async function updateBug(id: string, payload: UpdateBugPayload): Promise<Bug> {
  const { data } = await apiClient.patch<Bug>(`/bugs/${id}`, payload);
  return data;
}

export interface DeleteBugResult {
  id: string;
  deleted: true;
  /** Notifications pointing at the bug that were swept along with it. */
  notificationsRemoved: number;
}

export async function deleteBug(id: string): Promise<DeleteBugResult> {
  const { data } = await apiClient.delete<DeleteBugResult>(`/bugs/${id}`);
  return data;
}

export async function addBugComment(id: string, comment: string): Promise<BugComment> {
  const { data } = await apiClient.post<BugComment>(`/bugs/${id}/comments`, { comment });
  return data;
}

export async function uploadBugAttachment(id: string, file: File): Promise<BugAttachment> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await apiClient.post<BugAttachment>(`/bugs/${id}/attachments`, form);
  return data;
}

/** Short-lived signed download URL for a stored attachment. */
export async function getBugAttachmentUrl(id: string, attachmentId: string): Promise<string> {
  const { data } = await apiClient.get<{ url: string }>(
    `/bugs/${id}/attachments/${attachmentId}/signed-url`,
  );
  return data.url;
}

export async function deleteBugAttachment(id: string, attachmentId: string): Promise<void> {
  await apiClient.delete(`/bugs/${id}/attachments/${attachmentId}`);
}

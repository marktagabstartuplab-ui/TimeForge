import { apiClient } from "@/lib/api/client";

export type LeaveType = "ANNUAL" | "SICK" | "PERSONAL";
export type LeaveRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface LeaveRequestUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  departmentId: string | null;
  department?: { name: string } | null;
}

export interface LeaveRequestReviewer {
  id: string;
  firstName: string;
  lastName: string;
}

export interface LeaveRequest {
  id: string;
  userId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: string;
  reason: string;
  status: LeaveRequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  version: number;
  createdAt: string;
  user?: LeaveRequestUser | null;
  reviewer?: LeaveRequestReviewer | null;
}

export interface LeaveBalance {
  type: LeaveType;
  year: number;
  allocatedDays: number;
  usedDays: number;
  remainingDays: number;
}

export interface PageMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface Page<T> {
  data: T[];
  page: PageMeta;
}

export interface CreateLeaveRequestPayload {
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface LeaveRequestQuery {
  scope?: "self" | "team" | "org";
  status?: LeaveRequestStatus;
  type?: LeaveType;
  userId?: string;
  startDateFrom?: string;
  startDateTo?: string;
  reviewedAtFrom?: string;
  reviewedAtTo?: string;
  limit?: number;
  cursor?: string;
}

export async function getLeaveBalances(): Promise<LeaveBalance[]> {
  const { data } = await apiClient.get<LeaveBalance[]>("/leave/balances");
  return data;
}

export async function listLeaveRequests(query: LeaveRequestQuery = {}): Promise<Page<LeaveRequest>> {
  const { data } = await apiClient.get<Page<LeaveRequest>>("/leave/requests", {
    params: {
      ...(query.scope ? { scope: query.scope } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.startDateFrom ? { startDateFrom: query.startDateFrom } : {}),
      ...(query.startDateTo ? { startDateTo: query.startDateTo } : {}),
      ...(query.reviewedAtFrom ? { reviewedAtFrom: query.reviewedAtFrom } : {}),
      ...(query.reviewedAtTo ? { reviewedAtTo: query.reviewedAtTo } : {}),
      ...(query.limit ? { limit: query.limit } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
    },
  });
  return data;
}

export async function createLeaveRequest(payload: CreateLeaveRequestPayload): Promise<LeaveRequest> {
  const { data } = await apiClient.post<LeaveRequest>("/leave/requests", payload);
  return data;
}

export async function cancelLeaveRequest(id: string): Promise<LeaveRequest> {
  const { data } = await apiClient.post<LeaveRequest>(`/leave/requests/${id}/cancel`);
  return data;
}

export async function decideLeaveRequest(
  id: string,
  payload: { action: "APPROVE" | "REJECT"; remark?: string; expectedVersion: number },
): Promise<LeaveRequest> {
  const { data } = await apiClient.post<LeaveRequest>(`/leave/requests/${id}/decision`, payload);
  return data;
}

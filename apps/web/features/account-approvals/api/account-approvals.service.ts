import { apiClient } from "@/lib/api/client";
import type { Page } from "@/features/time-tracking/api/time-entries.service";

export interface PendingAccountRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  department: { id: string; name: string } | null;
  /** Role the applicant self-requested at registration (EMPLOYEE | INTERN). */
  requestedRole: "EMPLOYEE" | "INTERN" | null;
  role: { key: string; name: string } | null;
  emailVerifiedAt: string | null;
  createdAt: string;
  version: number;
  employmentType: string;
}

export interface PendingAccountsQuery {
  departmentId?: string;
  role?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}

export interface ApproveAccountPayload {
  version: number;
  departmentId?: string;
  employmentType?: string;
  roleKey?: string;
}

export async function listPendingAccounts(query: PendingAccountsQuery = {}): Promise<Page<PendingAccountRow>> {
  const { data } = await apiClient.get<Page<PendingAccountRow>>("/approvals/accounts", { params: query });
  return data;
}

export async function approveAccount(id: string, payload: ApproveAccountPayload): Promise<PendingAccountRow> {
  const { data } = await apiClient.post<PendingAccountRow>(`/approvals/accounts/${id}/approve`, payload);
  return data;
}

export async function rejectAccount(id: string, version: number, reason?: string): Promise<PendingAccountRow> {
  const { data } = await apiClient.post<PendingAccountRow>(`/approvals/accounts/${id}/reject`, { version, reason });
  return data;
}

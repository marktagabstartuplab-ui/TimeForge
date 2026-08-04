import { apiClient } from "@/lib/api/client";

export type GrievanceCategory =
  | "WORKPLACE_ENVIRONMENT"
  | "COLLEAGUE_ISSUE"
  | "PAYROLL_DISPUTE"
  | "HARASSMENT"
  | "SAFETY_CONCERN"
  | "MANAGEMENT_ISSUE"
  | "OTHER";

export type GrievanceStatus = "SUBMITTED" | "UNDER_REVIEW" | "RESOLVED";

export interface GrievanceEmployeeInfo {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  department: { name: string } | null;
}

export interface Grievance {
  id: string;
  tenantId: string;
  organizationId: string;
  employeeId: string;
  subject: string;
  category: GrievanceCategory;
  description: string;
  isAnonymous: boolean;
  status: GrievanceStatus;
  internalNotes?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: GrievanceEmployeeInfo;
}

export async function submitGrievance(payload: {
  subject: string;
  category: GrievanceCategory;
  description: string;
  isAnonymous?: boolean;
}): Promise<Grievance> {
  const { data } = await apiClient.post<Grievance>("/grievances", payload);
  return data;
}

export async function listMyGrievances(params: { status?: string; category?: string } = {}): Promise<Grievance[]> {
  const { data } = await apiClient.get<Grievance[]>("/grievances/my", { params });
  return data;
}

export async function listAllGrievances(params: { status?: string; category?: string } = {}): Promise<Grievance[]> {
  const { data } = await apiClient.get<Grievance[]>("/grievances", { params });
  return data;
}

export async function getGrievance(id: string): Promise<Grievance> {
  const { data } = await apiClient.get<Grievance>(`/grievances/${id}`);
  return data;
}

export async function updateGrievance(
  id: string,
  payload: { status?: GrievanceStatus; internalNotes?: string }
): Promise<Grievance> {
  const { data } = await apiClient.patch<Grievance>(`/grievances/${id}`, payload);
  return data;
}

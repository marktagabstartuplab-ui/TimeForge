import { apiClient } from "@/lib/api/client";
import type { Page } from "@/features/time-tracking/api/time-entries.service";
import type { Me } from "@/features/account/api/account.service";

export interface EmployeeRow extends Me {
  status: string;
  version: number;
}

export interface EmployeesQuery {
  q?: string;
  status?: string;
  departmentId?: string;
  role?: string;
  cursor?: string;
  limit?: number;
}

export interface UpdateEmployeePayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
  status?: string;
  departmentId?: string;
  version: number;
}

export interface BulkResult {
  results: { id?: string; status: "ok" | "error"; error?: string }[];
}

export interface CreateEmployeeInput {
  email: string;
  firstName: string;
  lastName: string;
  role: "EMPLOYEE" | "SUPERVISOR" | "HR" | "FINANCE" | "ADMIN";
  employmentType: "EMPLOYEE" | "INTERN" | "CONTRACTOR" | "PART_TIME" | "FULL_TIME";
}

export interface PermissionMatrix {
  roles: { id: string; key: string; name: string; isSystem: boolean }[];
  resources: {
    resource: string;
    label: string;
    permissions: { key: string; label: string; roles: Record<string, boolean> }[];
  }[];
}

export async function listEmployees(query: EmployeesQuery = {}): Promise<Page<EmployeeRow>> {
  const { data } = await apiClient.get<Page<EmployeeRow>>("/employees", { params: query });
  return data;
}

export async function getEmployee(id: string): Promise<EmployeeRow> {
  const { data } = await apiClient.get<EmployeeRow>(`/employees/${id}`);
  return data;
}

export async function updateEmployee(id: string, payload: UpdateEmployeePayload): Promise<EmployeeRow> {
  const { data } = await apiClient.patch<EmployeeRow>(`/employees/${id}`, payload);
  return data;
}

export async function inviteEmployee(payload: CreateEmployeeInput): Promise<EmployeeRow> {
  const { data } = await apiClient.post<EmployeeRow>("/employees/invite", payload);
  return data;
}

export async function importEmployees(users: CreateEmployeeInput[]): Promise<BulkResult> {
  const { data } = await apiClient.post<BulkResult>("/employees/import", { users });
  return data;
}

export async function exportEmployeesCsv(query: EmployeesQuery = {}): Promise<void> {
  const { data } = await apiClient.get<string>("/employees/export", { params: query });
  const blob = new Blob([data], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function getPermissionMatrix(): Promise<PermissionMatrix> {
  const { data } = await apiClient.get<PermissionMatrix>("/roles/matrix");
  return data;
}

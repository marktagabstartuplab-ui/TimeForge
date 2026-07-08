import { apiClient } from "@/lib/api/client";
import type { Page } from "@/features/time-tracking/api/time-entries.service";

export type ProjectStatus = "ON_TRACK" | "AT_RISK" | "DELAYED";

export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface DepartmentRow {
  id: string;
  name: string;
  managerId: string | null;
  manager: PersonRef | null;
  staffCount: number;
  projectCount: number;
  version: number;
  createdAt: string;
}

export interface ProjectRow {
  id: string;
  name: string;
  code: string;
  status: ProjectStatus;
  billable: boolean;
  department: { id: string; name: string } | null;
  client: { id: string; name: string } | null;
  teamSize: number;
  version: number;
  createdAt: string;
}

export interface OrgDashboard {
  summary: {
    totalDepartments: number;
    departmentsAddedThisMonth: number;
    activeProjects: number;
    projectsAddedThisMonth: number;
    totalEmployees: number;
    resourceUtilization: number;
  };
  departments: DepartmentRow[];
  projects: ProjectRow[];
  generatedAt: string;
}

export interface OrgHierarchyTeam {
  id: string;
  name: string;
  supervisor: PersonRef | null;
  memberCount: number;
}

export interface OrgHierarchyDepartment {
  id: string;
  name: string;
  manager: PersonRef | null;
  staffCount: number;
  teams: OrgHierarchyTeam[];
}

export interface OrgHierarchy {
  departments: OrgHierarchyDepartment[];
}

export interface OrgAnalytics {
  departmentDistribution: { departmentId: string; name: string; employeeCount: number }[];
  resourceAllocation: { departmentId: string; name: string; totalHours: number }[];
}

export interface CreateDepartmentPayload {
  name: string;
  managerId?: string;
}

export interface UpdateDepartmentPayload {
  name?: string;
  managerId?: string | null;
  version: number;
}

export interface CreateProjectPayload {
  name: string;
  code: string;
  departmentId: string;
  clientId?: string;
  status?: ProjectStatus;
  billable?: boolean;
}

export interface UpdateProjectPayload {
  name?: string;
  code?: string;
  departmentId?: string;
  clientId?: string;
  status?: ProjectStatus;
  billable?: boolean;
  version: number;
}

export async function getOrgDashboard(): Promise<OrgDashboard> {
  const { data } = await apiClient.get<OrgDashboard>("/organization/dashboard");
  return data;
}

export async function getOrgHierarchy(): Promise<OrgHierarchy> {
  const { data } = await apiClient.get<OrgHierarchy>("/organization/hierarchy");
  return data;
}

export async function getOrgAnalytics(): Promise<OrgAnalytics> {
  const { data } = await apiClient.get<OrgAnalytics>("/organization/analytics");
  return data;
}

/** Queues the export job; the file is delivered via a notification once the worker finishes. */
export async function exportOrgStructure(format: "CSV" | "EXCEL" | "PDF"): Promise<{ jobId: string }> {
  const { data } = await apiClient.post<{ jobId: string }>("/organization/export", { format });
  return data;
}

export async function createDepartment(payload: CreateDepartmentPayload): Promise<DepartmentRow> {
  const { data } = await apiClient.post<DepartmentRow>("/departments", payload);
  return data;
}

export async function updateDepartment(id: string, payload: UpdateDepartmentPayload): Promise<DepartmentRow> {
  const { data } = await apiClient.patch<DepartmentRow>(`/departments/${id}`, payload);
  return data;
}

export async function deleteDepartment(id: string, version: number): Promise<void> {
  await apiClient.delete(`/departments/${id}`, { params: { version } });
}

export async function createProject(payload: CreateProjectPayload): Promise<ProjectRow> {
  const { data } = await apiClient.post<ProjectRow>("/projects", payload);
  return data;
}

export async function updateProject(id: string, payload: UpdateProjectPayload): Promise<ProjectRow> {
  const { data } = await apiClient.patch<ProjectRow>(`/projects/${id}`, payload);
  return data;
}

export async function deleteProject(id: string, version: number): Promise<void> {
  await apiClient.delete(`/projects/${id}`, { params: { version } });
}

export async function listAllProjects(): Promise<Page<ProjectRow>> {
  const { data } = await apiClient.get<Page<ProjectRow>>("/projects", { params: { limit: 100 } });
  return data;
}

import { apiClient } from "@/lib/api/client";
import type { Page } from "@/features/time-tracking/api/time-entries.service";
import type { DepartmentRow } from "@/features/org-management/api/org-management.service";

/** Reuses the existing GET /departments list (all org members hold department:read). */
export async function listDepartments(): Promise<DepartmentRow[]> {
  const { data } = await apiClient.get<Page<DepartmentRow>>("/departments", { params: { limit: 100 } });
  return data.data;
}

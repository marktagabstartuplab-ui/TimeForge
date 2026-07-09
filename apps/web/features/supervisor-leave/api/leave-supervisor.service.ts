import { apiClient } from "@/lib/api/client";

export interface DepartmentItem {
  id: string;
  name: string;
  managerId: string | null;
  staffCount: number;
  projectCount: number;
}

export async function listDepartments(): Promise<DepartmentItem[]> {
  const { data } = await apiClient.get<{ data: DepartmentItem[]; page: unknown }>("/departments", {
    params: { limit: 100 },
  });
  return data.data;
}

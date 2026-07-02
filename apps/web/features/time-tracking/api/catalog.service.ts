import { apiClient } from "@/lib/api/client";
import type { Page } from "./time-entries.service";

export interface CatalogItem {
  id: string;
  name: string;
}

export interface Project extends CatalogItem {
  code: string;
  billable: boolean;
}

/**
 * Picker data (all org members hold the read permissions). The list endpoints
 * return the standard `{ data, page }` shape; pickers just need the first page.
 */
export async function listProjects(): Promise<Project[]> {
  const { data } = await apiClient.get<Page<Project>>("/projects", { params: { limit: 100 } });
  return data.data;
}

export async function listClients(): Promise<CatalogItem[]> {
  const { data } = await apiClient.get<Page<CatalogItem>>("/clients", { params: { limit: 100 } });
  return data.data;
}

export async function listWorkCategories(): Promise<CatalogItem[]> {
  const { data } = await apiClient.get<Page<CatalogItem>>("/work-categories", { params: { limit: 100 } });
  return data.data;
}

import { apiClient } from "@/lib/api/client";
import type { Page } from "@/features/time-tracking/api/time-entries.service";

export interface KpiProgressRow {
  id: string;
  userId: string;
  kpiTemplateId: string;
  periodKey: string;
  currentValue: string | number;
  targetValue: string | number;
  kpiTemplate?: { name: string; metricType: string; period: string };
}

/** GET /kpi/progress — self scope for employees (`kpi_progress:read`). */
export async function listKpiProgress(params: { periodKey?: string; limit?: number } = {}): Promise<KpiProgressRow[]> {
  const { data } = await apiClient.get<Page<KpiProgressRow> | KpiProgressRow[]>("/kpi/progress", {
    params: { limit: 50, ...params },
  });
  return Array.isArray(data) ? data : data.data;
}

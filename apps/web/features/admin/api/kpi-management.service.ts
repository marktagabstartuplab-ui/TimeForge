import { apiClient } from "@/lib/api/client";
import type { Page } from "@/features/time-tracking/api/time-entries.service";

export type KpiMetricType = "COUNT" | "HOURS" | "PERCENT" | "CURRENCY" | "CUSTOM";
export type KpiPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "PAYROLL_PERIOD";

export interface KpiTemplateRow {
  id: string;
  name: string;
  description: string | null;
  metricType: KpiMetricType;
  period: KpiPeriod;
  targetValue: string | number;
  appliesTo: { roles?: string[]; departments?: string[] } | null;
  unit: string | null;
  formula: string | null;
  validationRules: Record<string, unknown> | null;
  displayFormat: string | null;
  templateVersion: number;
  version: number;
}

export interface KpiTemplatePayload {
  name: string;
  description?: string;
  metricType: KpiMetricType;
  period: KpiPeriod;
  targetValue: number;
  appliesTo?: { roles?: string[]; departments?: string[] };
  unit?: string;
  formula?: string;
  validationRules?: Record<string, unknown>;
  displayFormat?: string;
}

export async function listKpiTemplates(): Promise<KpiTemplateRow[]> {
  const { data } = await apiClient.get<Page<KpiTemplateRow>>("/kpi/templates", { params: { limit: 100 } });
  return data.data;
}

export async function createKpiTemplate(payload: KpiTemplatePayload): Promise<KpiTemplateRow> {
  const { data } = await apiClient.post<KpiTemplateRow>("/kpi/templates", payload);
  return data;
}

export async function updateKpiTemplate(
  id: string,
  payload: Partial<KpiTemplatePayload> & { version: number },
): Promise<KpiTemplateRow> {
  const { data } = await apiClient.patch<KpiTemplateRow>(`/kpi/templates/${id}`, payload);
  return data;
}

export async function deleteKpiTemplate(id: string, version: number): Promise<void> {
  await apiClient.delete(`/kpi/templates/${id}`, { params: { version } });
}

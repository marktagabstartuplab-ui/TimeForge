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

export interface MyKpiSummaryRow {
  kpiTemplateId: string;
  name: string;
  description: string | null;
  metricType: string;
  period: string;
  unit: string | null;
  periodKey: string;
  current: number;
  target: number;
  pct: number;
  status: "MET" | "ON_TRACK" | "BELOW";
}

/** GET /kpi/progress — self scope for employees (`kpi_progress:read`). */
export async function listKpiProgress(params: { periodKey?: string; limit?: number } = {}): Promise<KpiProgressRow[]> {
  const { data } = await apiClient.get<Page<KpiProgressRow> | KpiProgressRow[]>("/kpi/progress", {
    params: { limit: 50, ...params },
  });
  return Array.isArray(data) ? data : data.data;
}

/** GET /kpi/my-summary — current user's KPI progress vs targets for the current period. */
export async function getMyKpiSummary(): Promise<MyKpiSummaryRow[]> {
  const { data } = await apiClient.get<MyKpiSummaryRow[]>("/kpi/my-summary");
  return data;
}

export interface TeamKpiSummary {
  teamAverage: number;
  belowTargetCount: number;
  change: string;
}

export interface TeamKpiChartPoint {
  name: string;
  score: number;
  target: number;
}

export interface UnderperformingMember {
  userId: string;
  name: string;
  role: string;
  score: number;
  variance: number;
  joinedAt: string;
}

export async function getTeamKpiSummary(params: { quarter?: string } = {}): Promise<TeamKpiSummary> {
  const { data } = await apiClient.get<TeamKpiSummary>("/kpi/team/summary", { params });
  return data;
}

export async function getTeamKpiChart(params: { quarter?: string } = {}): Promise<TeamKpiChartPoint[]> {
  const { data } = await apiClient.get<TeamKpiChartPoint[]>("/kpi/team/chart", { params });
  return data;
}

export async function getUnderperformingMembers(params: { quarter?: string } = {}): Promise<UnderperformingMember[]> {
  const { data } = await apiClient.get<UnderperformingMember[]>("/kpi/team/underperforming", { params });
  return data;
}

export async function submitCoachingRemarks(payload: { userId: string; remarks: string }): Promise<{ success: boolean }> {
  const { data } = await apiClient.post<{ success: boolean }>("/kpi/coaching", payload);
  return data;
}

export async function recordManualKpiProgress(dto: {
  kpiTemplateId: string;
  userId: string;
  currentValue: number;
  periodKey?: string;
}): Promise<KpiProgressRow> {
  const { data } = await apiClient.post<KpiProgressRow>("/kpi/progress/manual", dto);
  return data;
}

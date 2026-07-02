import { apiClient } from "@/lib/api/client";

export type DashboardScope = "self" | "team" | "org";

export interface KpiProgressRow {
  id: string;
  periodKey: string;
  currentValue: number;
  targetValue: number;
  kpiTemplate: { name: string; metricType: string; period: string };
}

export interface DashboardSummary {
  scope: DashboardScope;
  period: { from: string; to: string };
  timesheets: {
    total: number;
    byStatus: Record<string, number>;
  };
  hours: {
    totalMinutes: number;
    approvedMinutes: number;
  };
  kpi?: KpiProgressRow[];
  activeUsers?: number;
}

// GET /dashboard/summary — scope is auto-resolved server-side by permission
// (self / team / org). We never pass a scope param; the backend decides it.
export async function getDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await apiClient.get<DashboardSummary>("/dashboard/summary");
  return data;
}

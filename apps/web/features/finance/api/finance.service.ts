import { apiClient } from "@/lib/api/client";

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface FinanceDashboardResponse {
  totalPayroll: { value: number; trend: number };
  employeesReady: { value: number; total: number };
  pendingPayroll: { value: number };
  payrollCompletion: { value: number; completed: number; total: number };
  estimatedCost: { value: number };
  exportsCount: { value: number };
}

export interface FinanceTrendItem {
  label: string;
  totalPay: number;
  employeeCount: number;
  periodCount: number;
}

export interface FinanceTrendsResponse {
  period: string;
  trends: FinanceTrendItem[];
}

export interface FinanceActivityItem {
  id: string;
  type: "payroll_run" | "report_generation" | "compliance_alert" | "employee_update";
  title: string;
  description: string;
  timestamp: string;
  actorName?: string;
}

export interface FinanceActivityResponse {
  items: FinanceActivityItem[];
}

export interface FinanceComplianceResponse {
  lastScan: string | null;
  complianceScore: number;
  payrollHealth: "good" | "fair" | "poor";
  metrics: {
    exportedPeriods: number;
    totalPeriods: number;
    eligibleUsers: number;
    totalUsers: number;
    payrollReadyTimesheets: number;
    lockedPeriods: number;
  };
}

export interface FinanceDepartment {
  id: string;
  name: string;
  amount: number;
  percentage: number;
}

export interface FinanceDepartmentsResponse {
  totalSpend: number;
  departments: FinanceDepartment[];
}

export type TrendPeriod = "monthly" | "quarterly" | "yearly";

// ─── API calls ──────────────────────────────────────────────────────────────────

export async function getFinanceDashboard(): Promise<FinanceDashboardResponse> {
  const { data } = await apiClient.get<FinanceDashboardResponse>("/finance/dashboard");
  return data;
}

export async function getFinancePayrollTrends(period?: TrendPeriod): Promise<FinanceTrendsResponse> {
  const params = period ? { period } : undefined;
  const { data } = await apiClient.get<FinanceTrendsResponse>("/finance/payroll-trends", { params });
  return data;
}

export async function getFinanceActivity(): Promise<FinanceActivityResponse> {
  const { data } = await apiClient.get<FinanceActivityResponse>("/finance/activity");
  return data;
}

export async function getFinanceCompliance(): Promise<FinanceComplianceResponse> {
  const { data } = await apiClient.get<FinanceComplianceResponse>("/finance/compliance");
  return data;
}

export async function getFinanceDepartments(): Promise<FinanceDepartmentsResponse> {
  const { data } = await apiClient.get<FinanceDepartmentsResponse>("/finance/departments");
  return data;
}

export interface ExportDashboardInput {
  format?: "PDF" | "CSV" | "XLSX";
  periodId?: string;
}

export async function exportFinanceDashboard(input?: ExportDashboardInput): Promise<{ jobId: string; message: string }> {
  const { data } = await apiClient.post("/finance/export", input ?? {});
  return data;
}

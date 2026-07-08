import { apiClient } from "@/lib/api/client";

export interface DashboardCard {
  value: number;
  trend?: string;
  label?: string;
}

export interface ActiveRun {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  department: string;
  grossTotal: number;
  status: 'Pending' | 'Processing' | 'Completed';
}

export interface PayrollDashboardResponse {
  cards: {
    totalPayroll: DashboardCard;
    activePayruns: DashboardCard;
    pendingHRApprovals: DashboardCard;
    payEfficiency: DashboardCard;
  };
  activeRuns: ActiveRun[];
}

export interface DepartmentSpend {
  name: string;
  value: number; // percentage
  amount: number;
}

export interface PayrollDistributionResponse {
  totalSpend: number;
  departments: DepartmentSpend[];
}

export async function getPayrollDashboard(): Promise<PayrollDashboardResponse> {
  const { data } = await apiClient.get<PayrollDashboardResponse>("/payroll/dashboard");
  return data;
}

export async function getPayrollDistribution(): Promise<PayrollDistributionResponse> {
  const { data } = await apiClient.get<PayrollDistributionResponse>("/payroll/distribution");
  return data;
}

export interface RunActionInput {
  action: 'generate' | 'approve';
  periodId: string;
}

export async function runPayrollAction(input: RunActionInput): Promise<any> {
  const headers = input.action === 'generate' ? { "Idempotency-Key": crypto.randomUUID() } : undefined;
  const { data } = await apiClient.post("/payroll/run", input, { headers });
  return data;
}

export interface PayrollExportInput {
  format: 'PDF' | 'CSV' | 'XLSX';
  periodId?: string;
}

/** Queues the export job; the file is delivered via a notification once the worker finishes. */
export async function exportPayroll(input: PayrollExportInput): Promise<{ jobId: string }> {
  const { data } = await apiClient.post<{ jobId: string }>("/payroll/export", input);
  return data;
}

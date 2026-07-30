import { apiClient } from "@/lib/api/client";

export interface DashboardCard {
  value: number;
  trend?: string;
  label?: string;
}

export interface ActiveRun {
  id: string;
  batchId?: string;
  batchNumber?: string;
  employeeCount?: number;
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

// ─── Overtime rate configuration (BUG-AQ) ─────────────────────────────────────

/** The org's `payroll.overtime` setting. Other keys are preserved on write. */
export interface OvertimeSettingValue {
  multiplier?: number;
  dailyThresholdHours?: number;
  [key: string]: unknown;
}

interface OrganizationSetting {
  key: string;
  value: unknown;
}

export const DEFAULT_OVERTIME_MULTIPLIER = 1.25;

/** Reads the overtime config, falling back to the Labor Code default. */
export async function getOvertimeSetting(): Promise<OvertimeSettingValue> {
  const { data } = await apiClient.get<OrganizationSetting[]>("/organization/settings");
  const setting = data.find((s) => s.key === "payroll.overtime");
  return (setting?.value as OvertimeSettingValue) ?? {};
}

/**
 * Writes the multiplier back. The endpoint replaces the whole JSON value, so
 * the rest of the setting is spread in rather than dropped.
 */
export async function updateOvertimeMultiplier(
  multiplier: number,
  current: OvertimeSettingValue,
): Promise<void> {
  await apiClient.put("/organization/settings/payroll.overtime", {
    value: { ...current, multiplier },
    type: "json",
  });
}

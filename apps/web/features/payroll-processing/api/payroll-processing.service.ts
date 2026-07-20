import { apiClient } from "@/lib/api/client";

export type PayrollPeriodType = "FIRST_HALF" | "SECOND_HALF" | "CUSTOM";
export type PayrollPeriodStatus = "OPEN" | "GENERATED" | "LOCKED" | "EXPORTED";

export interface PayrollPeriod {
  id: string;
  type: PayrollPeriodType;
  status: PayrollPeriodStatus;
  startDate: string;
  endDate: string;
  lockedAt: string | null;
  exportedAt: string | null;
  updatedAt: string;
  version: number;
}

/** The period HR/Finance most recently touched (generated, locked, exported) —
 *  a better landing default than the newest-dated period, which is often an
 *  empty future one. */
export function mostRecentlyUpdatedPeriod(periods: PayrollPeriod[]): PayrollPeriod | null {
  if (periods.length === 0) return null;
  return periods.reduce((best, p) =>
    new Date(p.updatedAt).getTime() > new Date(best.updatedAt).getTime() ? p : best,
  );
}

export interface PayrollLineItem {
  id: string;
  userId: string;
  approvedHours: string;
  pendingHours: string;
  rejectedHours: string;
  overtimeHours: string;
  hourlyRate: string;
  estimatedPay: string;
  user: {
    firstName: string;
    lastName: string;
    email: string;
    employmentType: string;
    jobTitle: string | null;
    department: { name: string } | null;
  };
}

export interface PayrollReport {
  id: string;
  payrollPeriodId: string;
  totals: { headcount?: number; totalEstimatedPay?: string } | null;
  version: number;
  lineItems: PayrollLineItem[];
}

export interface Page<T> {
  data: T[];
  page: { limit: number; hasMore: boolean; nextCursor: string | null };
}

export async function listPeriods(): Promise<Page<PayrollPeriod>> {
  const { data } = await apiClient.get<Page<PayrollPeriod>>("/payroll/periods", { params: { limit: 50 } });
  return data;
}

export async function createPeriod(input: { type: PayrollPeriodType; startDate: string; endDate: string }): Promise<PayrollPeriod> {
  const { data } = await apiClient.post<PayrollPeriod>("/payroll/periods", input);
  return data;
}

export async function getReportByPeriod(periodId: string): Promise<PayrollReport | null> {
  const { data } = await apiClient.get<PayrollReport | null>(`/payroll/periods/${periodId}/report`);
  return data;
}

export async function generateReport(periodId: string): Promise<PayrollReport> {
  const { data } = await apiClient.post<PayrollReport>(
    `/payroll/periods/${periodId}/generate`,
    {},
    { headers: { "Idempotency-Key": crypto.randomUUID() } },
  );
  return data;
}

export async function lockPeriod(periodId: string): Promise<PayrollPeriod> {
  const { data } = await apiClient.post<PayrollPeriod>(`/payroll/periods/${periodId}/lock`);
  return data;
}

export async function flagDiscrepancies(reportId: string): Promise<{ flaggedCount: number }> {
  const { data } = await apiClient.post<{ flaggedCount: number }>(`/payroll/reports/${reportId}/flag-discrepancies`);
  return data;
}

export interface PayrollExportInput {
  format: "PDF" | "CSV" | "XLSX";
  periodId?: string;
}

/** Queues the export job via BullMQ; the file is delivered by notification once the worker finishes. */
export async function exportPayroll(input: PayrollExportInput): Promise<{ jobId: string }> {
  const { data } = await apiClient.post<{ jobId: string }>("/payroll/export", input);
  return data;
}

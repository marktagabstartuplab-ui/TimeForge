import { apiClient } from "@/lib/api/client";
import type { PayrollPeriod, PayrollPeriodStatus, PayrollPeriodType } from "@/features/payroll-processing/api/payroll-processing.service";

export type { PayrollPeriodType, PayrollPeriodStatus };

export type PayrollProcessingStatus =
  | "DRAFT"
  | "VALIDATING"
  | "VALIDATED"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "SENT_TO_BANK";

export interface FinancePayrollPeriod extends PayrollPeriod {
  processingStatus: PayrollProcessingStatus;
  validatedAt: string | null;
  validatedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  sentToBankAt: string | null;
  sentToBankBy: string | null;
}

export interface PayrollEmployee {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string | null;
  employmentType: string;
  department: { name: string } | null;
  hourlyRate: number;
  payrollEligible: boolean;
  status: string;
  estimatedPay: number;
  approvedHours: number;
  pendingHours: number;
  overtimeHours: number;
  payMultiplier: number;
  rowStatus: string;
  rejectedHours: number;
  lineItemId: string;
  /** The user's current base rate (null if unset) + version — for inline rate
   *  editing. Distinct from `hourlyRate`, which is this period's snapshotted
   *  line-item rate (they diverge after an edit until the report regenerates). */
  userHourlyRate: number | null;
  userVersion: number;
}

export interface PayrollAuditEntry {
  id: string;
  action: string;
  actorName: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

export interface ProcessingDashboard {
  grossPayroll: number;
  totalEmployees: number;
  estimatedTax: number;
  periodId: string;
  periodLabel: string;
  periodStatus: string;
  processingStatus: PayrollProcessingStatus;
  nextDeadline: { label: string; date: string } | null;
  employees: PayrollEmployee[];
  auditLog: PayrollAuditEntry[];
}

export async function getProcessingDashboard(periodId: string): Promise<ProcessingDashboard> {
  const { data } = await apiClient.get<ProcessingDashboard>(`/payroll/processing/${periodId}`);
  return data;
}

export async function getPayrollEmployees(): Promise<PayrollEmployee[]> {
  const { data } = await apiClient.get<PayrollEmployee[]>("/payroll/employees");
  return data;
}

/**
 * Sets an employee's base hourly rate (Finance/Admin only — `payroll_rate:update`).
 * Reuses the existing PATCH /payroll/rates/:userId endpoint with optimistic
 * concurrency; `version` comes from the employee's `userVersion`. Returns the
 * new version so the caller can PATCH again without a refetch.
 */
export async function updateUserRate(
  userId: string,
  rate: number,
  version: number,
): Promise<{ id: string; hourlyRate: number | null; version: number }> {
  const { data } = await apiClient.patch<{ id: string; hourlyRate: number | null; version: number }>(
    `/payroll/rates/${userId}`,
    null,
    { params: { rate, version } },
  );
  return data;
}

export async function getPayrollAuditLog(): Promise<PayrollAuditEntry[]> {
  const { data } = await apiClient.get<PayrollAuditEntry[]>("/payroll/audit-log");
  return data;
}

export async function getNextDeadline(): Promise<{ label: string; date: string } | null> {
  const { data } = await apiClient.get<{ label: string; date: string } | null>("/payroll/next-deadline");
  return data;
}

export async function validatePayroll(periodId: string): Promise<{ periodId: string; processingStatus: PayrollProcessingStatus }> {
  const { data } = await apiClient.post<{ periodId: string; processingStatus: PayrollProcessingStatus }>(
    "/payroll/validate",
    { periodId },
    { headers: { "Idempotency-Key": crypto.randomUUID() } },
  );
  return data;
}

export async function approvePayroll(periodId: string): Promise<{ periodId: string; processingStatus: PayrollProcessingStatus }> {
  const { data } = await apiClient.post<{ periodId: string; processingStatus: PayrollProcessingStatus }>(
    "/payroll/approve",
    { periodId },
    { headers: { "Idempotency-Key": crypto.randomUUID() } },
  );
  return data;
}

export async function rejectPayroll(periodId: string, reason: string): Promise<{ periodId: string; processingStatus: PayrollProcessingStatus }> {
  const { data } = await apiClient.post<{ periodId: string; processingStatus: PayrollProcessingStatus }>(
    "/payroll/reject",
    { periodId, reason },
    { headers: { "Idempotency-Key": crypto.randomUUID() } },
  );
  return data;
}

export async function sendPayrollToBank(periodId: string): Promise<{ periodId: string; processingStatus: PayrollProcessingStatus }> {
  const { data } = await apiClient.post<{ periodId: string; processingStatus: PayrollProcessingStatus }>(
    "/payroll/send",
    { periodId },
    { headers: { "Idempotency-Key": crypto.randomUUID() } },
  );
  return data;
}

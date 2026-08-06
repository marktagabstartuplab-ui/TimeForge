import { apiClient } from "@/lib/api/client";

/**
 * GET /payroll/me — employee self-view. Returns the caller's own line items
 * including the rate and pay snapshotted onto each one when the payroll report
 * was generated, so these figures match the Finance/HR payroll tables exactly.
 *
 * BR-PAY-06 restricts reading *other* people's rates, not your own — see
 * `PayrollService.getRate`, which permits `userId === p.userId`. Amount cards
 * fall back to a restricted state only when the separate rate lookup fails.
 *
 * `hourlyRate` and `estimatedPay` are non-nullable `Decimal` columns, so they
 * are always present and arrive JSON-serialised as strings.
 */
export interface PayrollLineItemSelf {
  id: string;
  approvedHours: string | number;
  pendingHours: string | number;
  rejectedHours: string | number;
  overtimeHours: string | number;
  holidayHours?: string | number;
  nightDiffHours?: string | number;
  restDayHours?: string | number;
  regularPay?: string | number;
  overtimePay?: string | number;
  nightDifferential?: string | number;
  holidayPay?: string | number;
  restDayPay?: string | number;
  grossTotal?: string | number;
  totalDeductions?: string | number;
  /**
   * BUG-BC: non-taxable de minimis benefits for the period. Added to `netPay`
   * but excluded from `grossTotal`, so it is rendered as its own line rather
   * than inside the earnings subtotal.
   */
  deMinimisTotal?: string | number;
  netPay?: string | number;
  hourlyRate: string | number;
  estimatedPay: string | number;
  createdAt: string;
  payrollReport: {
    payrollPeriodId: string;
    period: { startDate: string; endDate: string; status: string };
  };
}

export async function getMyPayroll(): Promise<PayrollLineItemSelf[]> {
  const { data } = await apiClient.get<PayrollLineItemSelf[]>("/payroll/me");
  return data;
}

export interface UserRate {
  id: string;
  firstName: string;
  lastName: string;
  hourlyRate: string | number | null;
}

/** Finance/Admin only (`payroll_rate:read`) — used to surface base rate + est. payout. */
export async function getUserRate(userId: string): Promise<UserRate> {
  const { data } = await apiClient.get<UserRate>(`/payroll/rates/${userId}`);
  return data;
}

/** Fetches the individual payslip PDF and triggers a client-side download. */
export async function downloadPayslipPdf(id: string): Promise<void> {
  const { data: blob } = await apiClient.get<Blob>(`/payroll/me/payslips/${id}/pdf`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payslip-${id}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

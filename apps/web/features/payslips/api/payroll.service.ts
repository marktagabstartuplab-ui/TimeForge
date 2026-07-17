import { apiClient } from "@/lib/api/client";

/**
 * GET /payroll/me — employee self-view. The backend intentionally returns
 * hours only; hourlyRate and pay amounts are excluded for employees
 * (BR-PAY-06). Amount cards therefore render a restricted state unless the
 * viewer holds `payroll_rate:read` (Finance/Admin).
 */
export interface PayrollLineItemSelf {
  id: string;
  approvedHours: string | number;
  pendingHours: string | number;
  rejectedHours: string | number;
  overtimeHours: string | number;
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

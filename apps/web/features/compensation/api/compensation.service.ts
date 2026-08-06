import { apiClient } from "@/lib/api/client";

export type DeMinimisType =
  | "RICE_SUBSIDY"
  | "CLOTHING_ALLOWANCE"
  | "LAUNDRY_ALLOWANCE"
  | "MEDICAL_ALLOWANCE"
  | "MEDICAL_CASH_ALLOWANCE_DEPENDENTS"
  | "MEAL_ALLOWANCE"
  | "OTHER";

export interface DeMinimisRule {
  type: DeMinimisType;
  label: string;
  /** Null when the regulation sets no fixed peso ceiling. */
  monthlyCap: number | null;
  statutoryBasis: string;
}

export interface CompensationPerson {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  jobTitle?: string | null;
  department?: { name: string } | null;
}

export interface DeMinimisBenefit {
  id: string;
  employeeId: string;
  benefitType: DeMinimisType;
  /** Effective (already capped) monthly amount. */
  monthlyAmount: string;
  /** What HR entered before capping. */
  requestedAmount: string;
  birMonthlyCap: string | null;
  isActive: boolean;
  notes?: string | null;
  employee?: CompensationPerson;
}

export interface ThirteenthMonthRow {
  employee: CompensationPerson;
  year: number;
  ytdBasicSalary: number;
  monthsWithEarnings: number;
  periodsCounted: number;
  thirteenthMonthPay: number;
}

export interface ThirteenthMonthReport {
  year: number;
  periodStart: string;
  periodEnd: string;
  headcount: number;
  totalYtdBasicSalary: number;
  totalThirteenthMonthPay: number;
  employees: ThirteenthMonthRow[];
}

export async function getThirteenthMonthTracker(params: {
  year?: number;
  employeeId?: string;
} = {}): Promise<ThirteenthMonthReport> {
  const { data } = await apiClient.get<ThirteenthMonthReport>("/compensation/thirteenth-month", {
    params,
  });
  return data;
}

export async function getDeMinimisCatalog(): Promise<DeMinimisRule[]> {
  const { data } = await apiClient.get<DeMinimisRule[]>("/compensation/de-minimis/catalog");
  return data;
}

export async function listDeMinimis(employeeId?: string): Promise<DeMinimisBenefit[]> {
  const { data } = await apiClient.get<DeMinimisBenefit[]>("/compensation/de-minimis", {
    params: employeeId ? { employeeId } : undefined,
  });
  return data;
}

export async function assignDeMinimis(payload: {
  employeeId: string;
  benefitType: DeMinimisType;
  monthlyAmount: number;
  notes?: string;
}): Promise<DeMinimisBenefit & { wasCapped: boolean; capLabel: string | null }> {
  const { data } = await apiClient.post<DeMinimisBenefit & { wasCapped: boolean; capLabel: string | null }>(
    "/compensation/de-minimis",
    payload,
  );
  return data;
}

export async function removeDeMinimis(id: string): Promise<{ success: boolean }> {
  const { data } = await apiClient.delete<{ success: boolean }>(`/compensation/de-minimis/${id}`);
  return data;
}

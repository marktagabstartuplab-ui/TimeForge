import { apiClient } from "@/lib/api/client";

/**
 * FEAT-3: 2026 Philippine statutory payroll — contribution settings and the
 * SSS / PhilHealth / Pag-IBIG / BIR compliance reports.
 */

export interface PayrollSettings {
  id: string;
  sssEmployeeRate: string;
  sssEmployerRate: string;
  sssSalaryCeiling: string;
  philhealthEmployeeRate: string;
  philhealthEmployerRate: string;
  philhealthMin: string;
  philhealthMax: string;
  pagibigEmployeeRateLow: string;
  pagibigEmployeeRateHigh: string;
  pagibigEmployerRate: string;
  pagibigSalaryThreshold: string;
  pagibigEmployeeCap: string;
  nightShiftPremium: string;
  nightShiftStartHour: number;
  nightShiftEndHour: number;
  regularHolidayWorkedRate: string;
  regularHolidayUnworkedRate: string;
  specialHolidayWorkedRate: string;
  thirteenthMonthExemptionCap: string;
  birTaxTableYear: number;
  version: number;
}

/** Every field optional — the settings form PATCHes only what the admin changed. */
export type PayrollSettingsUpdate = Partial<{
  sssEmployeeRate: number;
  sssEmployerRate: number;
  sssSalaryCeiling: number;
  philhealthEmployeeRate: number;
  philhealthEmployerRate: number;
  philhealthMin: number;
  philhealthMax: number;
  pagibigEmployeeRateLow: number;
  pagibigEmployeeRateHigh: number;
  pagibigEmployerRate: number;
  pagibigSalaryThreshold: number;
  pagibigEmployeeCap: number;
  nightShiftPremium: number;
  nightShiftStartHour: number;
  nightShiftEndHour: number;
  regularHolidayWorkedRate: number;
  regularHolidayUnworkedRate: number;
  specialHolidayWorkedRate: number;
  thirteenthMonthExemptionCap: number;
  birTaxTableYear: number;
}>;

export interface StatutoryReportPeriod {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
}

export interface ContributionReportRow {
  userId: string;
  email: string;
  name: string;
  department: string | null;
  monthlyGrossBasis: string;
  employeeShare: string;
  employerShare: string;
  total: string;
}

export interface ContributionReport {
  agency: "SSS" | "PHILHEALTH" | "PAGIBIG";
  period: StatutoryReportPeriod;
  headcount: number;
  totals: { employeeShare: string; employerShare: string; grandTotal: string };
  rows: ContributionReportRow[];
}

export interface BirReportRow {
  userId: string;
  email: string;
  name: string;
  department: string | null;
  grossCompensation: string;
  mandatoryContributions: string;
  taxableCompensation: string;
  taxWithheld: string;
  ytdTaxableIncome: string;
  ytdTaxWithheld: string;
  isThirteenthMonth: boolean;
}

export interface BirReport {
  taxYear: number;
  period: StatutoryReportPeriod;
  headcount: number;
  totals: {
    grossCompensation: string;
    mandatoryContributions: string;
    taxableCompensation: string;
    taxWithheld: string;
  };
  rows: BirReportRow[];
}

export async function getPayrollSettings(): Promise<PayrollSettings> {
  const { data } = await apiClient.get<PayrollSettings>("/payroll/settings");
  return data;
}

export async function updatePayrollSettings(
  input: PayrollSettingsUpdate,
): Promise<PayrollSettings> {
  const { data } = await apiClient.patch<PayrollSettings>("/payroll/settings", input);
  return data;
}

export type ContributionAgency = "sss" | "philhealth" | "pagibig";

export async function getContributionReport(
  agency: ContributionAgency,
  periodId?: string,
): Promise<ContributionReport> {
  const { data } = await apiClient.get<ContributionReport>(`/payroll/reports/${agency}`, {
    params: periodId ? { periodId } : undefined,
  });
  return data;
}

export async function getBirReport(periodId?: string): Promise<BirReport> {
  const { data } = await apiClient.get<BirReport>("/payroll/reports/bir", {
    params: periodId ? { periodId } : undefined,
  });
  return data;
}

import { apiClient } from "@/lib/api/client";
import type { ReportsQuery } from "@/features/reports/api/reports.service";

export interface FinanceDashboardCard {
  value: number;
  previous: number;
  change: number;
}

export interface FinanceDashboardResponse {
  attendance: FinanceDashboardCard;
  laborCost: FinanceDashboardCard;
  payroll: FinanceDashboardCard;
  compliance: FinanceDashboardCard;
}

export interface FinancePayrollLineItem {
  id: string;
  userId: string;
  employee: string;
  department: string | null;
  hourlyRate: number;
  approvedHours: number;
  overtimeHours: number;
  estimatedPay: number;
  employmentType: string;
}

export interface FinancePayrollPeriod {
  id: string;
  type: string;
  status: string;
  startDate: string;
  endDate: string;
}

export interface FinancePayrollReportResponse {
  totalGrossPayroll: number;
  totalEmployees: number;
  periods: FinancePayrollPeriod[];
  lineItems: FinancePayrollLineItem[];
}

export interface OvertimeDepartment {
  department: string;
  hours: number;
  cost: number;
  employeeCount: number;
}

export interface OvertimeAnalysisResponse {
  totalOvertimeHours: number;
  totalOvertimeCost: number;
  affectedEmployees: number;
  byDepartment: OvertimeDepartment[];
}

export async function getFinanceDashboard(params?: ReportsQuery): Promise<FinanceDashboardResponse> {
  const { data } = await apiClient.get<FinanceDashboardResponse>("/reports/finance/dashboard", { params });
  return data;
}

export async function getFinancePayrollReport(params?: ReportsQuery): Promise<FinancePayrollReportResponse> {
  const { data } = await apiClient.get<FinancePayrollReportResponse>("/reports/finance/payroll-report", { params });
  return data;
}

export async function getOvertimeAnalysis(params?: ReportsQuery): Promise<OvertimeAnalysisResponse> {
  const { data } = await apiClient.get<OvertimeAnalysisResponse>("/reports/finance/overtime", { params });
  return data;
}

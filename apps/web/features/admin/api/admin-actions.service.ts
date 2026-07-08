import { apiClient } from "@/lib/api/client";

export interface CreateEmployeeInput {
  email: string;
  firstName: string;
  lastName: string;
  role: "EMPLOYEE" | "SUPERVISOR" | "HR" | "FINANCE" | "ADMIN";
  employmentType: "EMPLOYEE" | "INTERN" | "CONTRACTOR" | "PART_TIME" | "FULL_TIME";
}

export async function createEmployee(input: CreateEmployeeInput): Promise<{ id: string }> {
  const { data } = await apiClient.post<{ id: string }>("/users", input);
  return data;
}

export type PayrollPeriodType = "FIRST_HALF" | "SECOND_HALF" | "CUSTOM";

export interface GeneratePayrollInput {
  type: PayrollPeriodType;
  startDate: string;
  endDate: string;
}

/** Creates a payroll period then immediately generates its report — a single "Generate Payroll" action. */
export async function generatePayroll(input: GeneratePayrollInput): Promise<{ periodId: string; reportId: string }> {
  const { data: period } = await apiClient.post<{ id: string }>("/payroll/periods", input);
  const { data: report } = await apiClient.post<{ id: string }>(
    `/payroll/periods/${period.id}/generate`,
    {},
    { headers: { "Idempotency-Key": crypto.randomUUID() } },
  );
  return { periodId: period.id, reportId: report.id };
}

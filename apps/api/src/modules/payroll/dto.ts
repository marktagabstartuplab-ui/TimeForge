import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PayrollPeriodType } from '@prisma/client';

export class CreatePayrollPeriodDto {
  @IsEnum(PayrollPeriodType)
  type!: PayrollPeriodType;

  /** ISO date string, e.g. "2026-06-01" */
  @IsString()
  startDate!: string;

  /** ISO date string, e.g. "2026-06-15" */
  @IsString()
  endDate!: string;
}

export class GeneratePayrollDto {
  /**
   * Marks the run as a 13th-month payout, so the tax-exempt portion (up to the
   * org's `thirteenthMonthExemptionCap`) is excluded from taxable income and no
   * SSS/PhilHealth/Pag-IBIG is assessed on it. Optional — omitted means a
   * regular run, which is the pre-FEAT-3 behaviour.
   */
  @IsBoolean()
  @IsOptional()
  thirteenthMonth?: boolean;
}

export class ExportPayrollDto {
  @IsEnum(['PDF', 'XLSX', 'BOTH'])
  format!: 'PDF' | 'XLSX' | 'BOTH';
}

export class RunActionDto {
  @IsEnum(['generate', 'approve'])
  action!: 'generate' | 'approve';

  @IsUUID()
  periodId!: string;
}

export class PayrollExportRequestDto {
  @IsEnum(['PDF', 'CSV', 'XLSX'])
  format!: 'PDF' | 'CSV' | 'XLSX';

  @IsUUID()
  @IsOptional()
  periodId?: string;
}

export interface PayrollPeriodQuery {
  limit?: string;
  cursor?: string;
  status?: string;
}

export interface PayrollRateQuery {
  userId: string;
}

export class RejectPayrollDto {
  @IsString()
  reason!: string;
}

// -- Finance Payroll Processing (validate/approve/reject/send-to-bank pipeline) --

export class PayrollActionDto {
  @IsUUID()
  periodId!: string;
}

// -- FEAT-3: statutory contribution settings --

/**
 * Every field optional — the admin screen PATCHes only what changed. Rate bounds
 * are deliberately generous (a rate is a fraction, a peso cap is not) but reject
 * the two mistakes that actually happen: a percentage entered as `5` instead of
 * `0.05`, and a negative value.
 */
export class UpdatePayrollSettingsDto {
  @IsNumber() @Min(0) @Max(1) @IsOptional() sssEmployeeRate?: number;
  @IsNumber() @Min(0) @Max(1) @IsOptional() sssEmployerRate?: number;
  @IsNumber() @Min(0) @IsOptional() sssSalaryCeiling?: number;

  @IsNumber() @Min(0) @Max(1) @IsOptional() philhealthEmployeeRate?: number;
  @IsNumber() @Min(0) @Max(1) @IsOptional() philhealthEmployerRate?: number;
  @IsNumber() @Min(0) @IsOptional() philhealthMin?: number;
  @IsNumber() @Min(0) @IsOptional() philhealthMax?: number;

  @IsNumber() @Min(0) @Max(1) @IsOptional() pagibigEmployeeRateLow?: number;
  @IsNumber() @Min(0) @Max(1) @IsOptional() pagibigEmployeeRateHigh?: number;
  @IsNumber() @Min(0) @Max(1) @IsOptional() pagibigEmployerRate?: number;
  @IsNumber() @Min(0) @IsOptional() pagibigSalaryThreshold?: number;
  @IsNumber() @Min(0) @IsOptional() pagibigEmployeeCap?: number;

  @IsNumber() @Min(1) @Max(3) @IsOptional() nightShiftPremium?: number;
  @IsInt() @Min(0) @Max(23) @IsOptional() nightShiftStartHour?: number;
  @IsInt() @Min(0) @Max(23) @IsOptional() nightShiftEndHour?: number;

  @IsNumber() @Min(0) @Max(5) @IsOptional() regularHolidayWorkedRate?: number;
  @IsNumber() @Min(0) @Max(5) @IsOptional() regularHolidayUnworkedRate?: number;
  @IsNumber() @Min(0) @Max(5) @IsOptional() specialHolidayWorkedRate?: number;

  @IsNumber() @Min(0) @IsOptional() thirteenthMonthExemptionCap?: number;

  @IsInt() @Min(2018) @Max(2100) @IsOptional() birTaxTableYear?: number;
}

export interface StatutoryReportQuery {
  /** Payroll period to report on. Defaults to the most recently generated period. */
  periodId?: string;
}

export class PayrollRejectActionDto {
  @IsUUID()
  periodId!: string;

  @IsString()
  reason!: string;
}

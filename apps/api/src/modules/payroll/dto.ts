import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
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

export class PayrollRejectActionDto {
  @IsUUID()
  periodId!: string;

  @IsString()
  reason!: string;
}

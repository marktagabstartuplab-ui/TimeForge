import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export enum FinanceTrendPeriod {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

export class FinanceTrendDto {
  @IsEnum(FinanceTrendPeriod)
  @IsOptional()
  period?: FinanceTrendPeriod;
}

export class ExportDashboardDto {
  @IsString()
  @IsOptional()
  format?: 'PDF' | 'CSV' | 'XLSX';

  @IsUUID()
  @IsOptional()
  periodId?: string;
}

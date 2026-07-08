import { IsEnum, IsOptional, IsString } from 'class-validator';

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

  @IsString()
  @IsOptional()
  periodId?: string;
}

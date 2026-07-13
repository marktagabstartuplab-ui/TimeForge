import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  IsInt,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
import { KpiMetricType, KpiPeriod } from '@prisma/client';

export class CreateKpiTemplateDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsEnum(KpiMetricType)
  metricType!: KpiMetricType;

  @IsEnum(KpiPeriod)
  period!: KpiPeriod;

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  targetValue!: number;

  /** Optional: { roles: string[], departments: string[] } */
  @IsOptional()
  appliesTo?: Record<string, string[]>;

  // ── Custom metric fields — only meaningful when metricType = CUSTOM ──────
  /** Required when metricType is CUSTOM (e.g. "tickets", "₱", "NPS points"). */
  @ValidateIf((o) => o.metricType === 'CUSTOM')
  @IsString()
  @MaxLength(50)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  formula?: string;

  /** Free-form validation rules, e.g. { min: 0, max: 100, step: 1 }. */
  @IsOptional()
  @IsObject()
  validationRules?: Record<string, unknown>;

  /** Display hint for the frontend, e.g. "percent", "currency", "number". */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  displayFormat?: string;
}

export class UpdateKpiTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsEnum(KpiMetricType)
  metricType?: KpiMetricType;

  @IsOptional()
  @IsEnum(KpiPeriod)
  period?: KpiPeriod;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  targetValue?: number;

  @IsOptional()
  appliesTo?: Record<string, string[]>;

  @ValidateIf((o) => o.metricType === 'CUSTOM')
  @IsString()
  @MaxLength(50)
  unit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  formula?: string;

  @IsOptional()
  @IsObject()
  validationRules?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  displayFormat?: string;

  @IsInt()
  @Type(() => Number)
  version!: number;
}

export interface KpiTemplateQuery {
  limit?: string;
  cursor?: string;
  q?: string;
}

export interface KpiProgressQuery {
  limit?: string;
  cursor?: string;
  userId?: string;
  kpiTemplateId?: string;
  periodKey?: string;
}

export class SubmitCoachingDto {
  @IsUUID()
  userId!: string;

  @IsString()
  remarks!: string;
}

export interface TeamKpiQuery {
  quarter?: string; // e.g. "Q1", "Q2", "Q3", "Q4"
}

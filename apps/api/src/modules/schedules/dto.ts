import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ShiftType } from '@prisma/client';

export class CreateShiftDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  /** ISO date, e.g. "2026-07-13" — the calendar day this shift belongs to. */
  @IsDateString()
  shiftDate!: string;

  /** ISO datetime — must fall on shiftDate and be before endTime. */
  @IsDateString()
  startTime!: string;

  @IsDateString()
  endTime!: string;

  @IsOptional()
  @IsEnum(ShiftType)
  shiftType?: ShiftType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Create directly as PUBLISHED (skip Save Draft) — defaults to false (DRAFT). */
  @IsOptional()
  @IsIn(['true', 'false'])
  publish?: string;
}

export class UpdateShiftDto {
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsDateString()
  shiftDate?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsEnum(ShiftType)
  shiftType?: ShiftType;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Publish a DRAFT shift, or unpublish back to DRAFT. */
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: 'DRAFT' | 'PUBLISHED';

  @IsInt()
  @Type(() => Number)
  version!: number;
}

export interface ScheduleQuery {
  limit?: string;
  cursor?: string;
  from?: string;
  to?: string;
  userId?: string;
  departmentId?: string;
  status?: string;
}

export interface ScheduleCalendarQuery {
  /** Week start date (ISO); defaults to the current week. */
  weekStart?: string;
  departmentId?: string;
  userId?: string;
}

import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  IsInt,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ScrumTaskStatus,
  ScrumTaskItemStatus,
  ScrumTaskPriority,
  BlockerSeverity,
  BlockerStatus,
} from '@prisma/client';

export class CreateScrumEntryDto {
  /** ISO date string, e.g. "2026-06-30" — must not be in the future. */
  @IsDateString()
  entryDate!: string;

  @IsString()
  @MaxLength(5000)
  yesterday!: string;

  @IsString()
  @MaxLength(5000)
  today!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  blockers?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Self-reported task progress for the day, 0–100. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  progress?: number;

  @IsOptional()
  @IsEnum(ScrumTaskStatus)
  status?: ScrumTaskStatus;
}

export class UpdateScrumEntryDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  yesterday?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  today?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  blockers?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  /** Self-reported task progress for the day, 0–100. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  progress?: number;

  @IsOptional()
  @IsEnum(ScrumTaskStatus)
  status?: ScrumTaskStatus;

  @IsInt()
  @Type(() => Number)
  version!: number;
}

export class CommentScrumEntryDto {
  @IsString()
  @MaxLength(2000)
  comment!: string;

  @IsInt()
  @Type(() => Number)
  version!: number;
}

export class UnlockScrumEntryDto {
  /**
   * Why the supervisor is unlocking the locked commitment — required, and kept in
   * the audit trail. Min 5 chars so the reason is meaningful, not a blank/space.
   */
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

export interface ScrumQuery {
  limit?: string;
  cursor?: string;
  userId?: string;
  from?: string;
  to?: string;
  hasBlockers?: string; // "true" | "false"
}

// ─── Scrum Tasks ──────────────────────────────────────────────────────────────

export class CreateScrumTaskDto {
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MaxLength(1000)
  expectedOutput!: string;

  @IsString()
  @MaxLength(1000)
  measurement!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(ScrumTaskPriority)
  priority?: ScrumTaskPriority;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  kpi?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  plannedTarget?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  estimatedHours?: number;
}

export class UpdateScrumTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  expectedOutput?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  measurement?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsEnum(ScrumTaskItemStatus)
  taskStatus?: ScrumTaskItemStatus;

  @IsOptional()
  @IsEnum(ScrumTaskPriority)
  priority?: ScrumTaskPriority;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  kpi?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  plannedTarget?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  estimatedHours?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  actualHours?: number;

  @IsInt()
  @Type(() => Number)
  version!: number;
}

// ─── Scrum Blockers ────────────────────────────────────────────────────────────

export class CreateScrumBlockerDto {
  @IsString()
  @MaxLength(500)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(BlockerSeverity)
  severity?: BlockerSeverity;
}

export class UpdateScrumBlockerDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(BlockerSeverity)
  severity?: BlockerSeverity;

  @IsOptional()
  @IsEnum(BlockerStatus)
  status?: BlockerStatus;

  @IsInt()
  @Type(() => Number)
  version!: number;
}

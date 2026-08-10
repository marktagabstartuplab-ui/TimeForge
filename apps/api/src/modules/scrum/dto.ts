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

export class CreateScrumEditRequestDto {
  /**
   * Why the employee needs their locked scrum back. Shown to the supervisor as
   * the basis for the decision, so it must say something — same 5-char floor as
   * the supervisor's unlock reason.
   */
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason!: string;
}

export class DeclineScrumEditRequestDto {
  /** Supervisor's explanation, returned to the employee with the decline. */
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
  needsReview?: string; // "true" | "false"
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

  /**
   * BUG-BH: optional because an ad-hoc task added mid-shift was never planned,
   * so it has no pre-declared expected output or measurement. Omitted stores an
   * empty string — the column is non-nullable and unchanged.
   */
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

  /**
   * BUG-BH: an ad-hoc task discovered during the EOD review is often already
   * finished by the time it is recorded, so it can be created COMPLETED rather
   * than created PENDING and immediately patched.
   */
  @IsOptional()
  @IsEnum(ScrumTaskItemStatus)
  taskStatus?: ScrumTaskItemStatus;

  @IsOptional()
  @IsEnum(ScrumTaskPriority)
  priority?: ScrumTaskPriority;

  // kpi display text is resolved from the template when kpiTemplateId is set;
  // plannedTarget is the employee's editable daily commitment (pre-filled from
  // the template but changeable). Free-text fallback when no template linked.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  kpi?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  plannedTarget?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  actualCompleted?: string;

  /**
   * BUG-BV: how far along a carried-over task already is, 0–100. Free integers
   * are accepted (the UI offers 0/25/50/75/100) so a future finer-grained input
   * doesn't need a contract change.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  completionPercentage?: number;

  @IsOptional()
  @IsUUID()
  kpiTemplateId?: string;

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
  @IsString()
  @MaxLength(200)
  actualCompleted?: string;

  /** BUG-BV: see CreateScrumTaskDto.completionPercentage. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  completionPercentage?: number;

  /** EOD shortfall follow-ups — only captured when actual falls short of planned. */
  @IsOptional()
  @IsBoolean()
  continueTomorrow?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notCompletedReason?: string;

  /** null explicitly clears an existing template link (switching to custom text); omit to leave unchanged. */
  @IsOptional()
  @IsUUID()
  kpiTemplateId?: string | null;

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

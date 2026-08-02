import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export const BUG_STATUSES = ['OPEN', 'IN_PROGRESS', 'FIXED', 'CLOSED', 'BLOCKED'] as const;
export const BUG_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export const BUG_SEVERITIES = ['P0', 'P1', 'P2', 'P3', 'P4'] as const;

export type BugStatusDto = (typeof BUG_STATUSES)[number];
export type BugPriorityDto = (typeof BUG_PRIORITIES)[number];
export type BugSeverityDto = (typeof BUG_SEVERITIES)[number];

export class CreateBugDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(5000)
  issue!: string;

  @IsString()
  @MaxLength(2000)
  whoAffected!: string;

  @IsString()
  @MaxLength(5000)
  whatISee!: string;

  @IsString()
  @MaxLength(5000)
  expected!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  errorMessage?: string;

  @IsString()
  @MaxLength(255)
  whereItHappens!: string;

  /**
   * Reporter-supplied severity. Priority is deliberately not accepted here —
   * scheduling is a triage decision (`bug:update`), not the reporter's call.
   */
  @IsOptional()
  @IsIn(BUG_SEVERITIES)
  severity?: BugSeverityDto;
}

/** Triage patch — every field requires `bug:update`. */
export class UpdateBugDto {
  @IsOptional()
  @IsIn(BUG_STATUSES)
  status?: BugStatusDto;

  @IsOptional()
  @IsIn(BUG_PRIORITIES)
  priority?: BugPriorityDto;

  @IsOptional()
  @IsIn(BUG_SEVERITIES)
  severity?: BugSeverityDto;

  /** `null` unassigns. */
  @IsOptional()
  @IsUUID()
  assignedTo?: string | null;
}

export class CreateBugCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  comment!: string;
}

export interface BugQuery {
  limit?: string;
  cursor?: string;
  /** Defaults to the widest scope the caller's permissions allow. */
  scope?: 'self' | 'team' | 'org';
  status?: string;
  priority?: string;
  severity?: string;
  assignedTo?: string;
  reportedBy?: string;
  search?: string;
}

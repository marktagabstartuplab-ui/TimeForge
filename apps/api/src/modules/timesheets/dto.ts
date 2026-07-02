import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTimesheetDto {
  @IsString()
  periodStart!: string; // ISO date string, e.g. "2025-06-01"

  @IsString()
  periodEnd!: string; // ISO date string, e.g. "2025-06-30"

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string;
}

export class UpdateTimesheetDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string;

  @IsInt()
  @Type(() => Number)
  version!: number;
}

export class SubmitTimesheetDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  summary?: string;

  @IsInt()
  @Type(() => Number)
  version!: number;
}

// NOTE (C1 fix): DecideTimesheetDto / the timesheet-level decide() transition was
// removed. Approval decisions go exclusively through ApprovalsService.decide()
// (POST /approvals/:timesheetId/decision) - see docs/Backend-RC-Review.md C1.

export class AttachEntriesDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  entryIds!: string[];
}

export interface TimesheetQuery {
  limit?: string;
  cursor?: string;
  status?: string;
  userId?: string;
  from?: string; // filter by periodStart >= from
  to?: string;   // filter by periodStart <= to
}

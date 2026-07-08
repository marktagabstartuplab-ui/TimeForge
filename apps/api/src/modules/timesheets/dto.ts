import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsInt,
  ValidateNested,
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
  departmentId?: string;
  search?: string; // employee first/last name, case-insensitive
  from?: string; // filter by periodStart >= from
  to?: string;   // filter by periodStart <= to
  sortBy?: string; // 'periodStart' | 'totalMinutes' | 'status' | 'submittedAt' — defaults to periodStart
  sortDir?: string; // 'asc' | 'desc' — defaults to desc
}

export interface TimesheetStatsQuery {
  departmentId?: string;
  from?: string;
  to?: string;
}

export interface TimesheetChartQuery {
  weeks?: string; // number of weeks for the weekly-submissions series, default 4
  months?: string; // number of months for the monthly-trend series, default 6
}

export class BulkTimesheetItemDto {
  @IsUUID()
  timesheetId!: string;

  @IsInt()
  @Type(() => Number)
  expectedVersion!: number;
}

export class BulkApproveTimesheetsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkTimesheetItemDto)
  items!: BulkTimesheetItemDto[];
}

export class BulkRejectTimesheetsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkTimesheetItemDto)
  items!: BulkTimesheetItemDto[];

  /** Required per BR-APP-02 — applied identically to every item in the batch. */
  @IsString()
  @MaxLength(2000)
  remark!: string;
}

export interface TimesheetHistoryQuery {
  /** '7d' | '30d' | 'month' | 'custom' — defaults to '7d'. */
  range?: string;
  from?: string; // required when range=custom
  to?: string;   // required when range=custom
  userId?: string;
}

export interface TimesheetHistoryRow {
  date: string;
  clockIn: string | null;
  clockOut: string | null;
  workMinutes: number;
  breakMinutes: number;
  totalMinutes: number;
  status: 'ACTIVE' | 'COMPLETE';
}

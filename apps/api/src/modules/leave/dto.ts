import { IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export const LEAVE_TYPES = ['ANNUAL', 'SICK', 'PERSONAL'] as const;
export type LeaveTypeDto = (typeof LEAVE_TYPES)[number];

export class CreateLeaveRequestDto {
  @IsIn(LEAVE_TYPES)
  type!: LeaveTypeDto;

  @IsISO8601({ strict: true })
  startDate!: string;

  @IsISO8601({ strict: true })
  endDate!: string;

  @IsString()
  @MaxLength(2000)
  reason!: string;
}

const DECISION_ACTIONS = ['APPROVE', 'REJECT'] as const;
export type DecisionActionDto = (typeof DECISION_ACTIONS)[number];

export class LeaveDecisionDto {
  @IsIn(DECISION_ACTIONS)
  action!: DecisionActionDto;

  /** Required for REJECT. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remark?: string;

  @IsInt()
  @Type(() => Number)
  expectedVersion!: number;
}

export interface LeaveRequestQuery {
  limit?: string;
  cursor?: string;
  scope?: 'self' | 'team' | 'org';
  status?: string;
  userId?: string;
  type?: string;
  /** Full-overlap: leave requests whose date range intersects [startDateFrom, startDateTo]. */
  startDateFrom?: string;
  startDateTo?: string;
  /** Filter by reviewedAt date range (for "approved/rejected today" queries). */
  reviewedAtFrom?: string;
  reviewedAtTo?: string;
}

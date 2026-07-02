import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

const APPROVAL_ACTIONS = ['APPROVE', 'REJECT', 'REQUEST_REVISION'] as const;
export type ApprovalActionDto = (typeof APPROVAL_ACTIONS)[number];

export class DecisionDto {
  @IsIn(APPROVAL_ACTIONS)
  action!: ApprovalActionDto;

  /**
   * Required (non-empty) for REJECT and REQUEST_REVISION.
   * Optional for APPROVE.
   */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  remark?: string;

  @IsInt()
  @Type(() => Number)
  expectedVersion!: number;
}

export class AddRemarkDto {
  @IsString()
  @MaxLength(5000)
  body!: string;
}

export interface ApprovalQueue {
  limit?: string;
  cursor?: string;
  userId?: string;
  status?: string;
}

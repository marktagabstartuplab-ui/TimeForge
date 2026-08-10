import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { ShiftSupervisorAction, ShiftViolationType } from '@prisma/client';

/** 24h is the hard ceiling — beyond that the day-rollover sweep closes the session anyway. */
const MAX_SHIFT_MINUTES = 24 * 60;

export class UpdateShiftConfigDto {
  @IsOptional() @IsString() @MaxLength(50) shiftName?: string;

  @IsOptional() @IsInt() @Min(60) @Max(MAX_SHIFT_MINUTES)
  maxShiftMinutes?: number;

  /**
   * Cumulative worked minutes allowed across all of a day's sessions. Separate
   * from maxShiftMinutes so an org can allow a long single shift but a shorter
   * payable day. Null clears it, restoring the fallback to maxShiftMinutes.
   */
  @IsOptional() @IsInt() @Min(60) @Max(MAX_SHIFT_MINUTES)
  maxDailyMinutes?: number | null;

  @IsOptional() @IsInt() @Min(0) @Max(240)
  gracePeriodMinutes?: number;

  @IsOptional() @IsInt() @Min(5) @Max(480)
  warningLeadMinutes?: number;

  @IsOptional() @IsBoolean() requiresSupervisorOverride?: boolean;
}

export class RequestOverrideDto {
  /** Extension asked for, in minutes. Capped at 8h so an override can't defeat the limit entirely. */
  @IsInt() @Min(15) @Max(480)
  additionalMinutes!: number;

  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class DecideOverrideDto {
  @IsBoolean() approved!: boolean;

  /** Lets a supervisor grant less than was requested. Defaults to the requested amount. */
  @IsOptional() @IsInt() @Min(15) @Max(480)
  additionalMinutes?: number;

  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class ViolationQueryDto {
  @IsOptional() @IsEnum(ShiftViolationType) violationType?: ShiftViolationType;
  @IsOptional() @IsEnum(ShiftSupervisorAction) supervisorAction?: ShiftSupervisorAction;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

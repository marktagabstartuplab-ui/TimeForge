import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EmployeeCalendarEventType } from '@prisma/client';

export class CreateCalendarEventDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsEnum(EmployeeCalendarEventType)
  eventType!: EmployeeCalendarEventType;

  /** ISO date string YYYY-MM-DD — the calendar day this event belongs to. */
  @IsDateString()
  eventDate!: string;

  /** Optional ISO datetime for the start of the event. */
  @IsOptional()
  @IsDateString()
  startTime?: string;

  /** Optional ISO datetime for the end of the event. */
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsEnum(EmployeeCalendarEventType)
  eventType?: EmployeeCalendarEventType;

  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @IsDateString()
  startTime?: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsInt()
  @Type(() => Number)
  version!: number;
}

export interface CalendarEventQuery {
  /** ISO date YYYY-MM-DD — start of range (inclusive). */
  from?: string;
  /** ISO date YYYY-MM-DD — end of range (inclusive). */
  to?: string;
}

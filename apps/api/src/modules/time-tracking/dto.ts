import { IsInt, IsArray, IsDateString, IsOptional, IsString, IsUUID, IsUrl, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTimeEntryDto {
  @IsDateString()
  startTime!: string;

  @IsOptional()
  @IsDateString()
  endTime?: string;

  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() workCategoryId?: string;

  @IsOptional() @IsString() @MaxLength(5000) description?: string;

  @IsOptional() @IsArray() @IsUrl({}, { each: true }) referenceLinks?: string[];
}

export class StartTimerDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() workCategoryId?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
}

export class UpdateTimeEntryDto {
  @IsOptional() @IsDateString() startTime?: string;
  @IsOptional() @IsDateString() endTime?: string;
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() workCategoryId?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsArray() @IsUrl({}, { each: true }) referenceLinks?: string[];

  @IsInt()
  @Type(() => Number)
  version!: number;
}

export interface TimeEntryQuery {
  limit?: string;
  cursor?: string;
  from?: string;
  to?: string;
  projectId?: string;
  clientId?: string;
  workCategoryId?: string;
  userId?: string;
  running?: string;
}

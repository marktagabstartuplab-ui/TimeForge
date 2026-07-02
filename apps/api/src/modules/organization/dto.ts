import { IsInt, IsBoolean, IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateOrgDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  timezone?: string;
}

export class UpsertSettingDto {
  @IsNotEmpty()
  value: unknown;

  @IsOptional()
  @IsString()
  type?: string;
}

export class CreateHolidayDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  recurring?: boolean;
}

export class DeleteHolidayVersionDto {
  @IsInt()
  @Type(() => Number)
  version!: number;
}

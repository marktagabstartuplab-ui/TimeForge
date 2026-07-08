import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ClockInDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() workCategoryId?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
}

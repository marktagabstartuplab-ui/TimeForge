import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { GrievanceCategory, GrievanceStatus } from '@prisma/client';

export class CreateGrievanceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject!: string;

  @IsEnum(GrievanceCategory)
  category!: GrievanceCategory;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsBoolean()
  @IsOptional()
  isAnonymous?: boolean;
}

export class UpdateGrievanceDto {
  @IsEnum(GrievanceStatus)
  @IsOptional()
  status?: GrievanceStatus;

  @IsString()
  @IsOptional()
  internalNotes?: string;
}

export class GrievanceQueryDto {
  @IsEnum(GrievanceStatus)
  @IsOptional()
  status?: GrievanceStatus;

  @IsEnum(GrievanceCategory)
  @IsOptional()
  category?: GrievanceCategory;
}

import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { GrievanceCategory, GrievanceStatus } from '@prisma/client';

export class CreateNteDto {
  @IsUUID()
  @IsNotEmpty()
  employeeId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  violationDescription!: string;
}

export class RespondNteDto {
  @IsString()
  @IsNotEmpty()
  response!: string;
}

export class CreateGrievanceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @IsOptional()
  @IsEnum(GrievanceCategory)
  category?: GrievanceCategory;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  isAnonymous?: boolean;
}

export class InitiateClearanceDto {
  @IsUUID()
  @IsNotEmpty()
  employeeId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApproveClearanceItemDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

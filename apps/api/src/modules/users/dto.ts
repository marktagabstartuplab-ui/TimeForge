import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EmploymentType } from '@prisma/client';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsEnum(['EMPLOYEE', 'SUPERVISOR', 'HR', 'FINANCE', 'ADMIN'])
  role!: string;

  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  supervisorId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  payrollEligible?: boolean;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsUUID()
  supervisorId?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  payrollEligible?: boolean;

  @IsInt()
  @Type(() => Number)
  version!: number;
}

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName?: string;
}

export class AssignRolesDto {
  @IsEnum(['EMPLOYEE', 'SUPERVISOR', 'HR', 'FINANCE', 'ADMIN'], { each: true })
  roles!: string[];
}

export class UsersListQuery {
  @IsOptional()
  limit?: string;

  @IsOptional()
  cursor?: string;

  @IsOptional()
  q?: string;

  @IsOptional()
  status?: string;

  @IsOptional()
  departmentId?: string;

  @IsOptional()
  teamId?: string;

  @IsOptional()
  role?: string;
}

import {
  IsArray,
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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EmploymentType, UserStatus } from '@prisma/client';

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

export class BulkImportEmployeesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateUserDto)
  users!: CreateUserDto[];
}

export interface EmployeesExportQuery {
  status?: string;
  departmentId?: string;
  teamId?: string;
  role?: string;
  q?: string;
}

export interface PendingAccountsQuery {
  departmentId?: string;
  role?: string;
  q?: string;
  limit?: string;
  cursor?: string;
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
  @IsString()
  @MaxLength(30)
  phone?: string;

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

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isApproved?: boolean;

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

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
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

export class ApproveUserDto {
  @IsInt()
  @Type(() => Number)
  version!: number;
}

export class RejectUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @IsInt()
  @Type(() => Number)
  version!: number;
}

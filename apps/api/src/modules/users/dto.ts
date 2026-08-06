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
  Matches,
  ValidateNested,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CompensationType, EmploymentType, UserStatus } from '@prisma/client';
import { STRONG_PASSWORD_REGEX, STRONG_PASSWORD_MESSAGE } from '../auth/dto';
import {
  isValidStatutoryId,
  statutoryIdMessage,
  type StatutoryIdField,
} from '../payroll/statutory-ids';

/**
 * BUG-AZ — validates a Philippine statutory identifier against its agency digit
 * mask. Separators are tolerated on input; `UsersService` normalizes to digits
 * before storing.
 */
function IsStatutoryId(field: StatutoryIdField, options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStatutoryId',
      target: object.constructor,
      propertyName,
      options: { message: statutoryIdMessage(field), ...options },
      validator: {
        validate: (value: unknown) =>
          value === null || value === undefined || typeof value === 'string'
            ? isValidStatutoryId(field, value as string | null | undefined)
            : false,
      },
    });
  };
}

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

  @IsOptional()
  @IsEnum(CompensationType)
  compensationType?: CompensationType;

  @IsOptional()
  @Type(() => Number)
  dailyRate?: number;

  @IsOptional()
  @Type(() => Number)
  daysPerWeek?: number;

  // BUG-AZ — Philippine statutory identifiers, optional at onboarding.
  @IsOptional()
  @IsStatutoryId('tin')
  tin?: string;

  @IsOptional()
  @IsStatutoryId('sssNumber')
  sssNumber?: string;

  @IsOptional()
  @IsStatutoryId('philhealthNumber')
  philhealthNumber?: string;

  @IsOptional()
  @IsStatutoryId('pagibigNumber')
  pagibigNumber?: string;
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
  @IsEmail()
  email?: string;

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
  @IsEnum(CompensationType)
  compensationType?: CompensationType;

  @IsOptional()
  @Type(() => Number)
  dailyRate?: number;

  @IsOptional()
  @Type(() => Number)
  daysPerWeek?: number;

  // BUG-AZ — Philippine statutory identifiers. Empty string clears a value HR
  // entered by mistake; anything else must match the agency digit mask.
  @IsOptional()
  @IsStatutoryId('tin')
  tin?: string;

  @IsOptional()
  @IsStatutoryId('sssNumber')
  sssNumber?: string;

  @IsOptional()
  @IsStatutoryId('philhealthNumber')
  philhealthNumber?: string;

  @IsOptional()
  @IsStatutoryId('pagibigNumber')
  pagibigNumber?: string;

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

  // BUG-AZ — Philippine statutory identifiers
  @IsOptional()
  @IsStatutoryId('tin')
  tin?: string;

  @IsOptional()
  @IsStatutoryId('sssNumber')
  sssNumber?: string;

  @IsOptional()
  @IsStatutoryId('philhealthNumber')
  philhealthNumber?: string;

  @IsOptional()
  @IsStatutoryId('pagibigNumber')
  pagibigNumber?: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MESSAGE })
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
  // On approval the admin assigns the applicant's final placement. All optional
  // for backward compatibility — omitting them keeps the applicant's registered
  // department and the default EMPLOYEE role.
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  /** Final RBAC role assigned on approval (replaces the default EMPLOYEE role). */
  @IsOptional()
  @IsEnum(['EMPLOYEE', 'SUPERVISOR', 'HR', 'FINANCE', 'ADMIN'])
  roleKey?: string;

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

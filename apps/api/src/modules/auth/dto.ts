import { IsEmail, IsNotEmpty, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

// Registration, password reset, and change-password all require an uppercase
// letter, a lowercase letter, and a special character. Kept in sync with the
// frontend `strongPassword` schema (apps/web/features/auth/schemas/auth.schema.ts).
export const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).+$/;
export const STRONG_PASSWORD_MESSAGE =
  'password must include an uppercase letter, a lowercase letter, and a special character';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MESSAGE })
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  token!: string;
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, { message: STRONG_PASSWORD_MESSAGE })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @IsString()
  @IsNotEmpty()
  // Exactly 11 digits (e.g. Philippine mobile 09XXXXXXXXX).
  @Matches(/^\d{11}$/, { message: 'phone must be exactly 11 digits' })
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  jobTitle!: string;

  @IsUUID()
  departmentId!: string;
}

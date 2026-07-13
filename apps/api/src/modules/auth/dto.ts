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

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
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
  // Must contain at least one lowercase letter, one uppercase letter, and one
  // special (non-alphanumeric) character. Kept in sync with the frontend
  // `strongPassword` schema (apps/web/features/auth/schemas/auth.schema.ts).
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).+$/, {
    message: 'password must include an uppercase letter, a lowercase letter, and a special character',
  })
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

import { IsEmail, IsIn, IsNotEmpty, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

// Roles a member of the public may request at self-registration. Privileged
// roles (SUPERVISOR/HR/FINANCE/ADMIN) are never self-requestable — an admin
// assigns those. Kept in sync with the frontend register schema.
export const SELF_REQUESTABLE_ROLES = ['EMPLOYEE', 'INTERN'] as const;

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
export const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
export const STRONG_PASSWORD_MESSAGE =
  'password must include an uppercase letter, a lowercase letter, a number, and a special character';

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
  // Philippine mobile, either local (09XXXXXXXXX) or +63 international
  // (+639XXXXXXXXX). Country-aware per the brief's +63 example.
  @Matches(/^(?:\+63|0)9\d{9}$/, {
    message: 'phone must be a valid PH mobile number (09XXXXXXXXX or +639XXXXXXXXX)',
  })
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  jobTitle!: string;

  @IsUUID()
  departmentId!: string;

  // What the user asked to be — a request only; the admin assigns the real role
  // on approval. Restricted to non-privileged roles.
  @IsIn(SELF_REQUESTABLE_ROLES)
  requestedRole!: (typeof SELF_REQUESTABLE_ROLES)[number];
}

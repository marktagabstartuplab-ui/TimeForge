import { z } from "zod";

// Field limits mirror the backend class-validator DTOs exactly
// (apps/api/src/modules/auth/dto.ts) — no stricter client-only rules invented.

export const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});
export type LoginValues = z.infer<typeof loginSchema>;

// Step 1 of the registration wizard (Figma: Full Name, Email, Department,
// terms). Phone is not in the design but the backend RegisterDto requires it,
// so it stays as a natural extension of the same layout.
export const registerStep1Schema = z.object({
  fullName: z.string().min(1, "Full name is required").max(200),
  email: z.string().min(1, "Email address is required").email("Enter a valid email address"),
  phone: z
    .string()
    .min(1, "Phone number is required")
    .regex(/^\d{11}$/, "Phone number must be exactly 11 digits"),
  departmentId: z.string().min(1, "Select a department").uuid("Select a department"),
  agreeToTerms: z.boolean().refine((v) => v === true, {
    message: "You must agree to the Terms of Service",
  }),
});
export type RegisterStep1Values = z.infer<typeof registerStep1Schema>;

// Shared password policy (registration, password reset, change password).
// Backend DTOs enforce the same rules — keep these in sync. Requires an upper-
// and lower-case letter and one special character, on top of the 8–128 length.
export const strongPassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[a-z]/, "Include at least one lowercase letter")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[^A-Za-z0-9]/, "Include at least one special character");

// Step 2. Department is chosen in step 1 and only *displayed* here (read-only),
// so it isn't a form field. workCategory is shown for design parity only (no
// backend field for signup) and is not sent.
export const registerStep2Schema = z
  .object({
    password: strongPassword,
    confirmPassword: z.string().min(1, "Please confirm your password"),
    workCategory: z.string().optional(),
    agreeToTerms: z.boolean().refine((v) => v === true, {
      message: "You must agree to the Terms of Service",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type RegisterStep2Values = z.infer<typeof registerStep2Schema>;

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
});
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const changePasswordSchema = z
  .object({
    password: strongPassword,
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

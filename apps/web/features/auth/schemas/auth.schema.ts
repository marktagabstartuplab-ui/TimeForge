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
  phone: z.string().min(1, "Phone number is required").max(30),
  departmentId: z.string().min(1, "Select a department").uuid("Select a department"),
  agreeToTerms: z.boolean().refine((v) => v === true, {
    message: "You must agree to the Terms of Service",
  }),
});
export type RegisterStep1Values = z.infer<typeof registerStep1Schema>;

// Step 2. Department maps to a real backend lookup; workCategory is shown for
// design parity only (no backend field for signup) and is not sent.
export const registerStep2Schema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    departmentId: z.string().min(1, "Select a department").uuid("Select a department"),
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
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

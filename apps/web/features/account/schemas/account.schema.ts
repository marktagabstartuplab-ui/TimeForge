import { z } from "zod";
import { strongPassword } from "@/features/auth/schemas/auth.schema";
import { isValidStatutoryId } from "../lib/statutory-ids";

// Field limits mirror the backend UpdateMeDto exactly (apps/api/src/modules/users/dto.ts).
// Email is read-only in the profile card, so it's intentionally not part of this form.
export const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  phone: z.string().max(30).optional().or(z.literal("")),
  tin: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || isValidStatutoryId("tin", val), {
      message: "TIN must be 9, 12, or 14 digits",
    }),
  sssNumber: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || isValidStatutoryId("sssNumber", val), {
      message: "SSS Number must be 10 digits",
    }),
  philhealthNumber: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || isValidStatutoryId("philhealthNumber", val), {
      message: "PhilHealth Number must be 12 digits",
    }),
  pagibigNumber: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || isValidStatutoryId("pagibigNumber", val), {
      message: "Pag-IBIG Number must be 12 digits",
    }),
});
export type ProfileValues = z.infer<typeof profileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: strongPassword,
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

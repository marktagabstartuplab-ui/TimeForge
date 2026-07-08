import { z } from "zod";

export const createEmployeeSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  role: z.enum(["EMPLOYEE", "SUPERVISOR", "HR", "FINANCE", "ADMIN"]),
  employmentType: z.enum(["EMPLOYEE", "INTERN", "CONTRACTOR", "PART_TIME", "FULL_TIME"]),
});
export type CreateEmployeeValues = z.infer<typeof createEmployeeSchema>;

export const generatePayrollSchema = z
  .object({
    type: z.enum(["FIRST_HALF", "SECOND_HALF", "CUSTOM"]),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
  })
  .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: "End date must be after the start date",
    path: ["endDate"],
  });
export type GeneratePayrollValues = z.infer<typeof generatePayrollSchema>;

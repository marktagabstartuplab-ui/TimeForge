import { z } from "zod";

export const departmentSchema = z.object({
  name: z.string().min(1, "Department name is required").max(200),
  managerId: z.string().optional(),
});
export type DepartmentValues = z.infer<typeof departmentSchema>;

export const projectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(200),
  code: z.string().min(1, "Project code is required").max(50),
  departmentId: z.string().min(1, "Department is required"),
  clientId: z.string().optional(),
  status: z.enum(["ON_TRACK", "AT_RISK", "DELAYED"]),
  billable: z.boolean(),
});
export type ProjectValues = z.infer<typeof projectSchema>;

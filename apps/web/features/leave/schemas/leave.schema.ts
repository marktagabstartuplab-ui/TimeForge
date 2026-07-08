import { z } from "zod";

export const LEAVE_TYPES = [
  { value: "ANNUAL", label: "Annual Leave" },
  { value: "SICK", label: "Sick Leave" },
  { value: "PERSONAL", label: "Personal Leave" },
] as const;

export const leaveRequestSchema = z
  .object({
    leaveType: z.string().min(1, "Select a leave category"),
    startDate: z.string().min(1, "Start date is required"),
    endDate: z.string().min(1, "End date is required"),
    reason: z.string().min(1, "Briefly describe the reason").max(2000, "Keep the reason under 2000 characters"),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    message: "End date must be on or after the start date",
    path: ["endDate"],
  });

export type LeaveRequestValues = z.infer<typeof leaveRequestSchema>;

import { z } from "zod";

/** Manual "Smart Timesheet" entry form (Employee Log Work frame). */
export const manualEntrySchema = z
  .object({
    date: z.string().min(1, "Date is required"),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
    clientId: z.string().optional(),
    projectId: z.string().optional(),
    workCategoryId: z.string().optional(),
    description: z
      .string()
      .min(1, "Describe the deliverables for this session")
      .max(5000, "Keep the description under 5000 characters"),
  })
  .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, {
    message: "End time must be after the start time",
    path: ["endTime"],
  });

export type ManualEntryValues = z.infer<typeof manualEntrySchema>;

/** Daily Scrum form (bottom of the Time Tracker page). */
export const dailyScrumSchema = z.object({
  yesterday: z.string().min(1, "Tell the team what you completed yesterday").max(5000),
  today: z.string().min(1, "List your main objectives for today").max(5000),
  blockers: z.string().max(5000).optional(),
  notes: z.string().max(2000).optional(),
});

export type DailyScrumValues = z.infer<typeof dailyScrumSchema>;

/** End of Day Review modal. */
export const eodReviewSchema = z.object({
  accomplishments: z
    .string()
    .min(1, "Briefly describe what you achieved today")
    .max(5000, "Keep it under 5000 characters"),
  finalBlockers: z.string().max(5000).optional(),
  confirmed: z.boolean().refine((v) => v, {
    message: "Please confirm your time logs are accurate",
  }),
});

export type EodReviewValues = z.infer<typeof eodReviewSchema>;

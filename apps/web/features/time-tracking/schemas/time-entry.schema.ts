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

/**
 * Daily Scrum card. `today` and `blockers` are JSON-serialized task/blocker
 * lists managed by ScrumTaskCard (empty string = none planned/reported —
 * both are legitimate, common states, not validation failures). Only
 * `yesterday` is a hand-typed narrative field and stays required.
 */
export const dailyScrumSchema = z.object({
  yesterday: z.string().min(1, "Tell the team what you completed yesterday").max(5000),
  today: z.string().max(5000, "Too many tasks — the combined details exceed the 5000-character limit").optional(),
  blockers: z
    .string()
    .max(5000, "Too many blockers — the combined details exceed the 5000-character limit")
    .optional(),
  notes: z.string().max(2000).optional(),
  progress: z.number().int().min(0).max(100, "Progress cannot exceed 100%"),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "COMPLETED"]),
});

export type DailyScrumValues = z.infer<typeof dailyScrumSchema>;

/**
 * Work Details card — context saved onto the running time entry.
 *
 * Task, Work Description and Work Category are mandatory (BUG-AP): they are what
 * makes a logged session auditable, and the card previously accepted a fully
 * blank save. Deliverables stays optional — a session can legitimately end with
 * work in progress and nothing shippable to name, and forcing a value there just
 * produces filler text in the payroll/performance exports that read the field.
 */
export const workDetailsSchema = z.object({
  task: z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(200, "Keep the task name under 200 characters"),
  workDescription: z
    .string()
    .trim()
    .min(1, "This field is required")
    .max(4500, "Keep the description under 4500 characters"),
  deliverables: z.string().max(5000, "Keep the deliverables under 5000 characters").optional(),
  departmentId: z.string().optional(),
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  workCategoryId: z.string().trim().min(1, "This field is required"),
});

export type WorkDetailsValues = z.infer<typeof workDetailsSchema>;

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

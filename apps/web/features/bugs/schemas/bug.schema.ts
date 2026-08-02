import { z } from "zod";

export const BUG_SEVERITIES = [
  { value: "P0", label: "P0 — Blocks everyone" },
  { value: "P1", label: "P1 — Major feature broken" },
  { value: "P2", label: "P2 — Broken, workaround exists" },
  { value: "P3", label: "P3 — Minor issue" },
  { value: "P4", label: "P4 — Cosmetic" },
] as const;

export const BUG_STATUSES = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "FIXED", label: "Fixed" },
  { value: "CLOSED", label: "Closed" },
  { value: "BLOCKED", label: "Blocked" },
] as const;

export const BUG_PRIORITIES = [
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const;

export const bugReportSchema = z.object({
  title: z.string().min(3, "Give the bug a short title").max(200, "Keep the title under 200 characters"),
  whereItHappens: z.string().min(1, "Where did this happen? (page or screen)").max(255),
  issue: z.string().min(1, "Describe the issue").max(5000),
  whoAffected: z.string().min(1, "Who is affected?").max(2000),
  whatISee: z.string().min(1, "What do you actually see?").max(5000),
  expected: z.string().min(1, "What did you expect instead?").max(5000),
  errorMessage: z.string().max(5000).optional(),
  severity: z.string().min(1, "Select a severity"),
});

export type BugReportValues = z.infer<typeof bugReportSchema>;

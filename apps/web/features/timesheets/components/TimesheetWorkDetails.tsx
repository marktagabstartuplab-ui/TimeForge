"use client";

/**
 * BUG-BI retired the Work Details UI: the task/project/deliverables/links/
 * attachments panel that used to render here is gone deliberately.
 *
 * The component is kept as an inert stub because Finance's payroll drill-down
 * still mounts it. Its body was left dangling below the `return null` when the
 * UI was removed, which made this file a syntax error and broke every
 * `apps/web` build and Vercel deploy from that commit onward — the body is now
 * deleted rather than merely unreachable.
 */
export function TimesheetWorkDetails(_props: { timesheetId: string }) {
  return null;
}

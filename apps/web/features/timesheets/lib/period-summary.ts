import type { TimeEntry } from "@/features/time-tracking/api/time-entries.service";
import type { Project } from "@/features/time-tracking/api/catalog.service";
import { minutesBetween, toIsoDate } from "@/lib/time";

const REGULAR_DAY_MINUTES = 8 * 60;

export interface PeriodSummary {
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  todayMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
  /** % of the period's working-day target (Mon–Fri × 8h) reached so far. */
  targetPercent: number;
  /** Days (YYYY-MM-DD) whose total exceeds 8h — used for Overtime badges. */
  overtimeDays: Set<string>;
}

function entryMinutes(entry: TimeEntry, now: Date): number {
  return entry.durationMinutes ?? minutesBetween(entry.startTime, entry.endTime ?? now.toISOString());
}

function workdaysBetween(start: Date, end: Date): number {
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * Client-side aggregation for the Submit Timesheet page. Billable follows the
 * project's `billable` flag; regular/overtime splits each day at 8 hours.
 */
export function summarizePeriod(
  entries: TimeEntry[],
  projects: Project[] | undefined,
  periodStart: Date,
  periodEnd: Date,
  now = new Date(),
): PeriodSummary {
  const billableProjectIds = new Set((projects ?? []).filter((p) => p.billable).map((p) => p.id));
  const todayKey = toIsoDate(now);

  const byDay = new Map<string, number>();
  let total = 0;
  let billable = 0;
  let todayMinutes = 0;

  for (const entry of entries) {
    const minutes = entryMinutes(entry, now);
    const dayKey = toIsoDate(new Date(entry.startTime));
    total += minutes;
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + minutes);
    if (dayKey === todayKey) todayMinutes += minutes;
    // Entries without a project count as non-billable (admin/internal work).
    if (entry.projectId && billableProjectIds.has(entry.projectId)) billable += minutes;
  }

  let overtime = 0;
  const overtimeDays = new Set<string>();
  for (const [day, minutes] of byDay) {
    if (minutes > REGULAR_DAY_MINUTES) {
      overtime += minutes - REGULAR_DAY_MINUTES;
      overtimeDays.add(day);
    }
  }

  const targetMinutes = workdaysBetween(periodStart, periodEnd) * REGULAR_DAY_MINUTES;

  return {
    totalMinutes: Math.round(total),
    regularMinutes: Math.round(total - overtime),
    overtimeMinutes: Math.round(overtime),
    todayMinutes: Math.round(todayMinutes),
    billableMinutes: Math.round(billable),
    nonBillableMinutes: Math.round(total - billable),
    targetPercent: targetMinutes > 0 ? Math.round((total / targetMinutes) * 100) : 0,
    overtimeDays,
  };
}

import type { TimeEntry } from "@/features/time-tracking/api/time-entries.service";
import type { Project } from "@/features/time-tracking/api/catalog.service";
import { minutesBetween, toIsoDate } from "@/lib/time";

const REGULAR_DAY_MINUTES = 8 * 60;

export interface HolidayInfo {
  date: string;
  type: "REGULAR" | "SPECIAL_NON_WORKING";
}

export interface PeriodSummary {
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  nightDiffMinutes: number;
  holidayMinutes: number;
  regularHolidayMinutes: number;
  specialHolidayMinutes: number;
  restDayMinutes: number;
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

/**
 * Calculates minutes of a shift that fall between 10:00 PM and 6:00 AM (22:00–06:00).
 */
export function calculateNightShiftMinutes(startTime: Date, durationMinutes: number): number {
  if (!durationMinutes || durationMinutes <= 0) return 0;
  let nsdMins = 0;
  const startMs = startTime.getTime();
  for (let m = 0; m < durationMinutes; m++) {
    const d = new Date(startMs + m * 60_000);
    const hour = d.getHours();
    if (hour >= 22 || hour < 6) {
      nsdMins++;
    }
  }
  return nsdMins;
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
  holidays?: HolidayInfo[],
  scheduledShiftDates?: Set<string>,
): PeriodSummary {
  const billableProjectIds = new Set((projects ?? []).filter((p) => p.billable).map((p) => p.id));
  const todayKey = toIsoDate(now);
  const holidayMap = new Map((holidays ?? []).map((h) => [h.date, h.type]));

  const byDay = new Map<string, number>();
  let total = 0;
  let billable = 0;
  let todayMinutes = 0;
  let nightDiffMinutes = 0;
  let regularHolidayMinutes = 0;
  let specialHolidayMinutes = 0;
  let restDayMinutes = 0;

  for (const entry of entries) {
    const minutes = entryMinutes(entry, now);
    const startDate = new Date(entry.startTime);
    const dayKey = toIsoDate(startDate);
    total += minutes;
    byDay.set(dayKey, (byDay.get(dayKey) ?? 0) + minutes);
    if (dayKey === todayKey) todayMinutes += minutes;
    // Entries without a project count as non-billable (admin/internal work).
    if (entry.projectId && billableProjectIds.has(entry.projectId)) billable += minutes;

    // NSD (10 PM - 6 AM)
    nightDiffMinutes += calculateNightShiftMinutes(startDate, minutes);

    // Holidays
    const hType = holidayMap.get(dayKey);
    if (hType === "REGULAR") {
      regularHolidayMinutes += minutes;
    } else if (hType === "SPECIAL_NON_WORKING") {
      specialHolidayMinutes += minutes;
    }

    // Rest Days (work on scheduled day off or weekend if no schedule)
    const isRestDay = scheduledShiftDates
      ? !scheduledShiftDates.has(dayKey)
      : startDate.getDay() === 0 || startDate.getDay() === 6;
    if (isRestDay) {
      restDayMinutes += minutes;
    }
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
    nightDiffMinutes: Math.round(nightDiffMinutes),
    holidayMinutes: Math.round(regularHolidayMinutes + specialHolidayMinutes),
    regularHolidayMinutes: Math.round(regularHolidayMinutes),
    specialHolidayMinutes: Math.round(specialHolidayMinutes),
    restDayMinutes: Math.round(restDayMinutes),
    todayMinutes: Math.round(todayMinutes),
    billableMinutes: Math.round(billable),
    nonBillableMinutes: Math.round(total - billable),
    targetPercent: targetMinutes > 0 ? Math.round((total / targetMinutes) * 100) : 0,
    overtimeDays,
  };
}

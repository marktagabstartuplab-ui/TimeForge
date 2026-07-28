/**
 * Calendar-day helpers that resolve days in an organization's timezone rather
 * than UTC.
 *
 * Why this exists: timestamp columns (`startTime`, `clockIn`, `reviewedAt`, …)
 * are stored as UTC instants, and slicing them with `toISOString().slice(0,10)`
 * buckets them into *UTC* days. For an organization at UTC+8 that mis-files
 * everything between local midnight and local 08:00 into the previous day —
 * which is the start of a work shift, not a quiet hour.
 *
 * Date-only columns (`@db.Date`: workDate, entryDate, shiftDate, periodStart …)
 * are a different case: they carry no time component and are already written at
 * UTC midnight, so `orgDayKey` is NOT needed for those — use `startOfOrgDay` to
 * produce the value to store, so the day it names is the local one.
 */

/** Used when an organization has no timezone configured. */
export const DEFAULT_TIME_ZONE = 'Asia/Manila';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converts a local wall-clock time in `timeZone` to the equivalent UTC instant,
 * using only the native Intl API (no date library). Accurate except within the
 * same second as a DST transition — Asia/Manila has none.
 */
export function zonedTimeToUtc(
  y: number,
  m: number,
  d: number,
  timeZone: string,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const utcGuess = Date.UTC(y, m - 1, d, hour, minute, second);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const part of fmt.formatToParts(new Date(utcGuess))) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }
  const readAsUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour === 24 ? 0 : map.hour,
    map.minute,
    map.second,
  );
  return new Date(utcGuess - (readAsUtc - utcGuess));
}

/**
 * The `YYYY-MM-DD` calendar day a UTC instant falls on in `timeZone`.
 * Use this to group timestamps by day instead of `toISOString().slice(0, 10)`.
 */
export function orgDayKey(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * Start of a calendar day in `timeZone`, as a UTC instant.
 *
 * `date` may be a `YYYY-MM-DD` string or a Date (whose local day in `timeZone`
 * is used). `dayOffset` shifts by whole local days — pass 1 for an exclusive
 * upper bound covering the whole day.
 */
export function startOfOrgDay(
  date: Date | string = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
  dayOffset = 0,
): Date {
  const key = typeof date === 'string' ? date : orgDayKey(date, timeZone);
  if (!DATE_ONLY.test(key)) return new Date(key);
  const [y, m, d] = key.split('-').map(Number);
  return zonedTimeToUtc(y, m, d + dayOffset, timeZone);
}

/**
 * Start of the week containing `instant`, in `timeZone`, as a UTC instant.
 * `weekOffset` shifts by whole weeks — pass -1 for the previous week.
 * `weekStartsOn` is 1 (Monday, ISO) by default; pass 0 for a Sunday-start week.
 */
export function startOfOrgWeek(
  instant: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
  weekOffset = 0,
  weekStartsOn: 0 | 1 = 1,
): Date {
  const [y, m, d] = orgDayKey(instant, timeZone).split('-').map(Number);
  // getUTCDay on the local day's own calendar values gives the local weekday.
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sun = 0 … Sat = 6
  const back = weekStartsOn === 1 ? ((dow || 7) - 1) : dow;
  return zonedTimeToUtc(y, m, d - back + weekOffset * 7, timeZone);
}

/**
 * Start of the calendar month containing `instant`, in `timeZone`, as a UTC
 * instant. `monthOffset` shifts by whole months — pass -5 for six months back.
 */
export function startOfOrgMonth(
  instant: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
  monthOffset = 0,
): Date {
  const [y, m] = orgDayKey(instant, timeZone).split('-').map(Number);
  // Date.UTC normalises month overflow/underflow, so this handles year edges.
  const normalised = new Date(Date.UTC(y, m - 1 + monthOffset, 1));
  return zonedTimeToUtc(normalised.getUTCFullYear(), normalised.getUTCMonth() + 1, 1, timeZone);
}

/**
 * The `YYYY-MM-DD` local days of an ISO week, Monday first. `length` trims the
 * week — pass 5 for Mon–Fri.
 */
export function orgWeekDays(
  instant: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
  weekOffset = 0,
  length = 7,
): string[] {
  const [y, m, d] = orgDayKey(startOfOrgWeek(instant, timeZone, weekOffset), timeZone)
    .split('-')
    .map(Number);
  // Pure calendar arithmetic on the local day numbers — no instant involved, so
  // no DST hazard from adding fixed-length days.
  return Array.from({ length }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}

/**
 * The UTC-midnight Date that names the *local* calendar day of `instant` — the
 * value to store in a `@db.Date` column so the recorded day matches the day the
 * user experienced.
 */
export function orgDateOnly(
  instant: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  return new Date(`${orgDayKey(instant, timeZone)}T00:00:00.000Z`);
}

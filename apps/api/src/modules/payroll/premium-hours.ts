/**
 * Night-differential and holiday hour attribution (FEAT-3).
 *
 * Kept as pure functions with no Prisma or Nest dependency so the arithmetic is
 * directly unit-testable — these are the figures a DOLE inspection looks at.
 */

/** Minutes of local-clock offset from UTC at `instant` in `timeZone`. */
export function localOffsetMinutes(instant: Date, timeZone: string): number {
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
  for (const part of fmt.formatToParts(instant)) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour === 24 ? 0 : map.hour,
    map.minute,
    map.second,
  );
  // Sub-second remainder would otherwise make this a non-integer.
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Minutes of a shift that fall inside the night-differential window.
 *
 * The window is expressed in local wall-clock hours and normally wraps midnight
 * (22:00 → 06:00), so it is evaluated as two windows per local day and summed
 * across every day the shift touches. A shift is assumed to sit at a single UTC
 * offset — true for Asia/Manila, which has no DST.
 *
 * @param startHour first hour of the window, local (e.g. 22)
 * @param endHour   first hour *after* the window, local (e.g. 6)
 */
export function nightShiftMinutes(
  startTime: Date,
  durationMinutes: number,
  timeZone: string,
  startHour: number,
  endHour: number,
): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 0;
  if (startHour === endHour) return 0;

  const offset = localOffsetMinutes(startTime, timeZone);
  const localStart = Math.floor(startTime.getTime() / 60_000) + offset;
  const localEnd = localStart + durationMinutes;

  const DAY = 1440;
  const firstDay = Math.floor(localStart / DAY);
  const lastDay = Math.floor((localEnd - 1) / DAY);

  let total = 0;
  for (let day = firstDay; day <= lastDay; day++) {
    const base = day * DAY;
    if (startHour < endHour) {
      // Non-wrapping window (e.g. an org that configures 00:00–06:00).
      total += overlap(localStart, localEnd, base + startHour * 60, base + endHour * 60);
    } else {
      // Wrapping window: evening segment on this day, morning segment on this day.
      total += overlap(localStart, localEnd, base + startHour * 60, base + DAY);
      total += overlap(localStart, localEnd, base, base + endHour * 60);
    }
  }
  return total;
}

/** `YYYY-MM-DD` key for a `@db.Date` column (stored at UTC midnight, no time part). */
export function dateOnlyKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Every `YYYY-MM-DD` between two date-only bounds, inclusive. Used to find the
 * holidays in a payroll period that an employee did *not* work.
 */
export function dateKeysBetween(start: Date, end: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cursor.getTime() <= last) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

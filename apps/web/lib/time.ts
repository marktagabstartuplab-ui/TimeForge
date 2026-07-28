/** Time/date helpers shared by the employee workspace features. */

/** "8h 45m" from minutes; "0m" when zero/negative. */
export function formatMinutes(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** "07:45" (clock-style hours:minutes) from minutes. */
export function formatMinutesClock(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "01:23:45" elapsed stopwatch display from seconds. */
export function formatStopwatch(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Decimal hours with one fraction digit, e.g. 80.0. */
export function minutesToHours(totalMinutes: number): number {
  return Math.round((totalMinutes / 60) * 10) / 10;
}

/** "9:00 AM" in the user's locale-ish fixed format used by the designs. */
export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** "Oct 16 - Oct 31, 2023" range label. */
export function formatPeriodRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startLabel = start.toLocaleDateString("en-US", opts);
  const endLabel = end.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${startLabel} - ${endLabel}`;
}

/** Local YYYY-MM-DD for date inputs / API date params. */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The organization's operating timezone — all "today" dashboard windows are Manila days. */
export const ORG_TIME_ZONE = "Asia/Manila";

/**
 * The organization's calendar day for `date`, as YYYY-MM-DD.
 *
 * Prefer this over `toIsoDate` for anything sent to the API: `toIsoDate` reads
 * the *viewer's machine* clock, so a laptop set to another timezone silently
 * requests a shifted window. These mirror `packages/shared/src/timezone.ts`;
 * apps/web is a separate npm project and cannot import it.
 */
export function toOrgIsoDate(date: Date = new Date()): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ORG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Today's YYYY-MM-DD in the organization's timezone. */
export function todayInOrgTimeZone(): string {
  return toOrgIsoDate(new Date());
}

/** Converts a wall-clock time in ORG_TIME_ZONE to the equivalent UTC instant. */
function orgTimeToUtc(y: number, m: number, d: number): Date {
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ORG_TIME_ZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcGuess));
  const map: Record<string, number> = {};
  for (const part of parts) if (part.type !== "literal") map[part.type] = Number(part.value);
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

/** Start of an organization-timezone day, as an instant. `dayOffset` shifts whole local days. */
export function startOfOrgDay(date: Date | string = new Date(), dayOffset = 0): Date {
  const key = typeof date === "string" ? date : toOrgIsoDate(date);
  const [y, m, d] = key.split("-").map(Number);
  return orgTimeToUtc(y, m, d + dayOffset);
}

/** Last millisecond of an organization-timezone day — the inclusive `to` bound the API expects. */
export function endOfOrgDay(date: Date | string = new Date()): Date {
  return new Date(startOfOrgDay(date, 1).getTime() - 1);
}

/** Semi-monthly pay period (1–15, 16–end) containing `date`, in organization-local days. */
export function currentOrgPayPeriod(date: Date = new Date()): { start: Date; end: Date } {
  const [y, m, d] = toOrgIsoDate(date).split("-").map(Number);
  return d <= 15
    ? { start: startOfOrgDay(`${y}-${String(m).padStart(2, "0")}-01`), end: startOfOrgDay(`${y}-${String(m).padStart(2, "0")}-15`) }
    : {
        start: startOfOrgDay(`${y}-${String(m).padStart(2, "0")}-16`),
        // Day 0 of the next month is the last day of this one.
        end: startOfOrgDay(toOrgIsoDate(new Date(Date.UTC(y, m, 0)))),
      };
}

/** Start of the local day. */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** End of the local day. */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Monday-start week window containing `date`. */
export function weekWindow(date: Date): { from: Date; to: Date } {
  const from = startOfDay(date);
  const dow = (from.getDay() + 6) % 7; // Mon=0
  from.setDate(from.getDate() - dow);
  const to = new Date(from);
  to.setDate(to.getDate() + 6);
  return { from, to: endOfDay(to) };
}

/**
 * Semi-monthly pay period containing `date` (1–15, 16–end of month), matching
 * the period style shown in the Submit Timesheet design.
 */
export function currentPayPeriod(date: Date): { start: Date; end: Date } {
  const y = date.getFullYear();
  const m = date.getMonth();
  if (date.getDate() <= 15) {
    return { start: new Date(y, m, 1), end: new Date(y, m, 15) };
  }
  return { start: new Date(y, m, 16), end: new Date(y, m + 1, 0) };
}

/** Minutes elapsed between two ISO timestamps (>= 0). */
export function minutesBetween(startIso: string, endIso: string): number {
  return Math.max(0, (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60_000);
}

import type { TimeEntry } from "../api/time-entries.service";
import { minutesBetween } from "@/lib/time";

/** Gaps shorter than this between sessions are treated as continuations, not breaks. */
export const MIN_BREAK_MINUTES = 1;

/**
 * Whether the gap between two consecutive entries falls *inside* one clock-in
 * session, which is what makes it a break.
 *
 * Between sessions the employee is clocked out — not on break. Split shifts
 * (BUG-BX) make that gap routine: travel between sites, an evening return. A
 * 6am–12pm / 5pm–7pm day was reporting "Break 5h 00m" and a 13-hour total for
 * 8 hours of work, and that break figure feeds the timesheet totals.
 *
 * Manual entries carry no `workSessionId`. Those keep the previous reading —
 * with no session to compare, there is nothing to distinguish a break from a
 * boundary, and treating them as breaks is the established behaviour.
 */
function isWithinOneSession(previous: TimeEntry, next: TimeEntry): boolean {
  if (!previous.workSessionId || !next.workSessionId) return true;
  return previous.workSessionId === next.workSessionId;
}

export interface DaySummary {
  /** Minutes tracked across all of today's entries (running entry counted up to now). */
  trackedMinutes: number;
  /** Idle gaps between consecutive entries — the day's break time. */
  breakMinutes: number;
  /** Number of distinct breaks (gaps ≥ 1 min between sessions). */
  breakCount: number;
  entryCount: number;
  /**
   * BUG-BX — distinct clock-in sessions in the day. A split shift produces
   * several, and the timesheet reports one merged row annotated with this
   * count rather than a row per session. Manual entries (no `workSessionId`)
   * each count once, and a day with no timer sessions reports 0.
   */
  sessionCount: number;
  running: TimeEntry | null;
  /** First session start today (clock in), null before the first Time In. */
  clockInAt: string | null;
  /** Last session end today; null while a session is still running or before any session. */
  clockOutAt: string | null;
}

export type TimelineEventKind = "clock-in" | "break" | "clock-out" | "running";

export interface TimelineEvent {
  at: string;
  /** Break end — only on "break" events; null while the break is ongoing. */
  endAt?: string | null;
  /** Whole break length in minutes — only on finished "break" events. */
  durationMinutes?: number;
  kind: TimelineEventKind;
  label: string;
}

/** Aggregates a day's entries for the tracker widgets, Smart Timesheet and EOD review. */
export function summarizeDay(entries: TimeEntry[], now = new Date()): DaySummary {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  let tracked = 0;
  let breaks = 0;
  let breakCount = 0;
  let running: TimeEntry | null = null;
  let prevEnd: string | null = null;
  // The entry `prevEnd` belongs to, so a gap can be told apart from a session
  // boundary. Tracked alongside prevEnd and advanced with it.
  let prevEntry: TimeEntry | null = null;

  // Clamp to the day being summarised, anchored on its own entries — not on
  // `now`. Callers that summarise history (MyTimesheetCard, one call per past
  // day) pass no `now`, so anchoring here on today put every past day's window
  // in the wrong place: the interval never overlapped and the day reported 0m
  // despite having a clock-in and a clock-out. Today's row was unaffected,
  // which is why only history looked broken.
  const anchor = sorted.length > 0 ? new Date(sorted[0].startTime) : new Date(now);
  const dayStart = new Date(anchor);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(anchor);
  dayEnd.setHours(23, 59, 59, 999);
  const dayStartTime = dayStart.getTime();
  const dayEndTime = dayEnd.getTime();

  for (const entry of sorted) {
    const rawEndIso = entry.endTime ?? now.toISOString();
    if (!entry.endTime) running = entry;

    const entryStartMs = new Date(entry.startTime).getTime();
    const entryEndMs = new Date(rawEndIso).getTime();

    // Clamp entry interval to today's 24-hour window
    const clampedStartMs = Math.max(entryStartMs, dayStartTime);
    const clampedEndMs = Math.min(entryEndMs, dayEndTime);

    if (clampedEndMs > clampedStartMs) {
      tracked += (clampedEndMs - clampedStartMs) / 60_000;
    }

    if (prevEnd && prevEntry && isWithinOneSession(prevEntry, entry)) {
      const gap = minutesBetween(prevEnd, entry.startTime);
      if (gap >= MIN_BREAK_MINUTES) {
        breaks += gap;
        breakCount += 1;
      }
    }
    if (!prevEnd || rawEndIso > prevEnd) {
      prevEnd = rawEndIso;
      prevEntry = entry;
    }
  }

  const last = sorted[sorted.length - 1] ?? null;

  return {
    trackedMinutes: Math.round(tracked),
    breakMinutes: Math.round(breaks),
    breakCount,
    entryCount: sorted.length,
    sessionCount: new Set(sorted.map((e) => e.workSessionId ?? `entry:${e.id}`)).size,
    running,
    clockInAt: sorted[0]?.startTime ?? null,
    clockOutAt: running ? null : (last?.endTime ?? null),
  };
}

/**
 * Read-only activity timeline for the day: Clock In → Breaks → Time Out,
 * chronologically. Each break is a single grouped event carrying its start,
 * end and duration (gaps under MIN_BREAK_MINUTES are continuations and don't
 * appear at all). `onBreak` turns the trailing stop into an ongoing break
 * instead of a time-out.
 */
export function buildDayTimeline(entries: TimeEntry[], onBreak: boolean): TimelineEvent[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  if (sorted.length === 0) return [];

  const events: TimelineEvent[] = [
    { at: sorted[0].startTime, kind: "clock-in", label: "Clock In" },
  ];

  let running = false;
  let prevEnd: string | null = null;
  let prevEntry: TimeEntry | null = null;

  for (const entry of sorted) {
    if (prevEnd && prevEntry && entry.startTime > prevEnd) {
      const gap = minutesBetween(prevEnd, entry.startTime);
      if (isWithinOneSession(prevEntry, entry)) {
        if (gap >= MIN_BREAK_MINUTES) {
          events.push({
            at: prevEnd,
            endAt: entry.startTime,
            durationMinutes: Math.round(gap),
            kind: "break",
            label: "Break",
          });
        }
      } else {
        // A session ended and a later one began: the employee clocked out and
        // back in. Showing that as one "Break" misread the day.
        events.push({ at: prevEnd, kind: "clock-out", label: "Time Out" });
        events.push({ at: entry.startTime, kind: "clock-in", label: "Clock In" });
      }
    }
    if (!entry.endTime) running = true;
    if (entry.endTime && (!prevEnd || entry.endTime > prevEnd)) {
      prevEnd = entry.endTime;
      prevEntry = entry;
    }
  }

  if (running) {
    const last = sorted[sorted.length - 1];
    events.push({ at: last.startTime, kind: "running", label: "Session in progress" });
  } else if (onBreak && prevEnd) {
    events.push({ at: prevEnd, endAt: null, kind: "break", label: "Break" });
  } else if (prevEnd) {
    events.push({ at: prevEnd, kind: "clock-out", label: "Time Out" });
  }

  return events;
}

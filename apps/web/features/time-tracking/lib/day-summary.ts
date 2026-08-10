import type { TimeEntry } from "../api/time-entries.service";
import type { SessionEvent } from "../api/work-sessions.service";
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
 * Read-only activity timeline for the day, built from the DTR events the
 * server recorded (BUG-BW) rather than inferred from gaps between time
 * entries.
 *
 * Inference was lossy in both directions: a break shorter than
 * MIN_BREAK_MINUTES vanished entirely, and any gap it did keep was labelled a
 * break whether or not one was taken. These rows are the breaks — BREAK_START
 * paired with its BREAK_END — so every one appears at its exact server
 * timestamp, however short, and the timeline agrees with the audit record by
 * construction.
 *
 * Events must be chronological, which is the order the daily-log endpoint
 * returns them in. TASK_COMPLETED is not a clock event and is skipped.
 */
export function timelineFromSessionEvents(events: SessionEvent[]): TimelineEvent[] {
  const timeline: TimelineEvent[] = [];
  // The BREAK_START waiting for its BREAK_END. Held back so the pair can be
  // emitted as one event carrying the whole break, matching how the card
  // renders a break as a range rather than two separate rows.
  let openBreakAt: string | null = null;
  let lastAt: string | null = null;
  let clockedOut = false;

  for (const event of events) {
    lastAt = event.occurredAt;
    switch (event.eventType) {
      case "CLOCK_IN":
        timeline.push({ at: event.occurredAt, kind: "clock-in", label: "Clock In" });
        clockedOut = false;
        break;
      case "BREAK_START":
        openBreakAt = event.occurredAt;
        break;
      case "BREAK_END":
        if (openBreakAt) {
          timeline.push({
            at: openBreakAt,
            endAt: event.occurredAt,
            durationMinutes: Math.round(minutesBetween(openBreakAt, event.occurredAt)),
            kind: "break",
            label: "Break",
          });
          openBreakAt = null;
        }
        break;
      case "CLOCK_OUT":
        timeline.push({ at: event.occurredAt, kind: "clock-out", label: "Time Out" });
        clockedOut = true;
        break;
      default:
        break;
    }
  }

  // A break still open at the end of the log is one the employee is on now.
  if (openBreakAt) {
    timeline.push({ at: openBreakAt, endAt: null, kind: "break", label: "Break" });
    return timeline;
  }
  // Clocked in, not on break, no clock-out yet — the session is still running.
  if (!clockedOut && lastAt && timeline.length > 0) {
    timeline.push({ at: lastAt, kind: "running", label: "Session in progress" });
  }
  return timeline;
}

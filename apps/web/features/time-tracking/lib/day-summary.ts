import type { TimeEntry } from "../api/time-entries.service";
import { minutesBetween } from "@/lib/time";

/** Gaps shorter than this between sessions are treated as continuations, not breaks. */
export const MIN_BREAK_MINUTES = 1;

export interface DaySummary {
  /** Minutes tracked across all of today's entries (running entry counted up to now). */
  trackedMinutes: number;
  /** Idle gaps between consecutive entries — the day's break time. */
  breakMinutes: number;
  /** Number of distinct breaks (gaps ≥ 1 min between sessions). */
  breakCount: number;
  entryCount: number;
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

  for (const entry of sorted) {
    const end = entry.endTime ?? now.toISOString();
    if (!entry.endTime) running = entry;
    tracked += entry.durationMinutes ?? minutesBetween(entry.startTime, end);
    if (prevEnd) {
      const gap = minutesBetween(prevEnd, entry.startTime);
      if (gap >= MIN_BREAK_MINUTES) {
        breaks += gap;
        breakCount += 1;
      }
    }
    if (!prevEnd || end > prevEnd) prevEnd = end;
  }

  const last = sorted[sorted.length - 1] ?? null;

  return {
    trackedMinutes: Math.round(tracked),
    breakMinutes: Math.round(breaks),
    breakCount,
    entryCount: sorted.length,
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

  for (const entry of sorted) {
    if (prevEnd && entry.startTime > prevEnd) {
      const gap = minutesBetween(prevEnd, entry.startTime);
      if (gap >= MIN_BREAK_MINUTES) {
        events.push({
          at: prevEnd,
          endAt: entry.startTime,
          durationMinutes: Math.round(gap),
          kind: "break",
          label: "Break",
        });
      }
    }
    if (!entry.endTime) running = true;
    if (entry.endTime && (!prevEnd || entry.endTime > prevEnd)) prevEnd = entry.endTime;
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

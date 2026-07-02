import type { TimeEntry } from "../api/time-entries.service";
import { minutesBetween } from "@/lib/time";

export interface DaySummary {
  /** Minutes tracked across all of today's entries (running entry counted up to now). */
  trackedMinutes: number;
  /** Idle gaps between consecutive entries — the EOD modal's "Break Duration". */
  breakMinutes: number;
  entryCount: number;
  running: TimeEntry | null;
}

/** Aggregates a day's entries for the tracker widgets and the EOD review. */
export function summarizeDay(entries: TimeEntry[], now = new Date()): DaySummary {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  let tracked = 0;
  let breaks = 0;
  let running: TimeEntry | null = null;
  let prevEnd: string | null = null;

  for (const entry of sorted) {
    const end = entry.endTime ?? now.toISOString();
    if (!entry.endTime) running = entry;
    tracked += entry.durationMinutes ?? minutesBetween(entry.startTime, end);
    if (prevEnd) breaks += minutesBetween(prevEnd, entry.startTime);
    if (!prevEnd || end > prevEnd) prevEnd = end;
  }

  return {
    trackedMinutes: Math.round(tracked),
    breakMinutes: Math.round(breaks),
    entryCount: sorted.length,
    running,
  };
}

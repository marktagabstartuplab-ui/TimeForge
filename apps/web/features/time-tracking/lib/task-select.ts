import type { TimeEntry } from "../api/time-entries.service";
import { minutesBetween } from "@/lib/time";

/**
 * The backend has no Task entity — a "task" is the recurring work context an
 * employee tracks time against: the first line of a time entry's description
 * plus its project/client/category. Quick Select, the scrum card header and
 * Work Details all share this shape.
 */
export interface WorkTask {
  /** Stable identity: project + title (case-insensitive). */
  key: string;
  title: string;
  projectId: string | null;
  clientId: string | null;
  workCategoryId: string | null;
  /** Long description part (below the title line) of the latest entry. */
  details: string;
  /** Minutes tracked against this task within the queried range. */
  minutes: number;
  /** Most recent startTime — used to sort "recent". */
  lastUsedAt: string;
}

/** First line = task title; the rest = long-form description. */
export function splitDescription(description: string | null): { task: string; details: string } {
  if (!description) return { task: "", details: "" };
  const [first, ...rest] = description.split("\n");
  return { task: first.trim(), details: rest.join("\n").trim() };
}

/** Inverse of splitDescription — what gets saved to TimeEntry.description. */
export function composeDescription(task: string, details: string): string | undefined {
  const parts = [task.trim(), details.trim()].filter(Boolean);
  return parts.length ? parts.join("\n\n").slice(0, 5000) : undefined;
}

export function taskKey(projectId: string | null, title: string): string {
  return `${projectId ?? "none"}::${title.trim().toLowerCase()}`;
}

/** Groups entries into distinct tasks, most recently used first. */
export function deriveTasks(entries: TimeEntry[]): WorkTask[] {
  const byKey = new Map<string, WorkTask>();

  for (const entry of entries) {
    const { task, details } = splitDescription(entry.description);
    const title = task || "General work";
    const key = taskKey(entry.projectId, title);
    const minutes =
      entry.durationMinutes ??
      minutesBetween(entry.startTime, entry.endTime ?? new Date().toISOString());

    const existing = byKey.get(key);
    if (existing) {
      existing.minutes += minutes;
      if (entry.startTime > existing.lastUsedAt) {
        existing.lastUsedAt = entry.startTime;
        existing.clientId = entry.clientId;
        existing.workCategoryId = entry.workCategoryId;
        existing.details = details || existing.details;
      }
    } else {
      byKey.set(key, {
        key,
        title,
        projectId: entry.projectId,
        clientId: entry.clientId,
        workCategoryId: entry.workCategoryId,
        details,
        minutes,
        lastUsedAt: entry.startTime,
      });
    }
  }

  return [...byKey.values()].sort((a, b) => (a.lastUsedAt < b.lastUsedAt ? 1 : -1));
}

/**
 * Pinned tasks are a client-side convenience (no backend home) — the pin set
 * lives in localStorage, same pattern as the break flag.
 *
 * TODO: Replace localStorage pinned-task persistence with a backend endpoint
 * (e.g. POST /users/me/pinned-tasks) once available. Current implementation
 * is per-browser and does not sync across devices.
 */
const PIN_KEY = "timeforge.pinned-tasks";

export function readPinnedKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PIN_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function togglePinnedKey(key: string): string[] {
  const current = readPinnedKeys();
  const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
  window.localStorage.setItem(PIN_KEY, JSON.stringify(next));
  return next;
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { Coffee } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { listProjects } from "../api/catalog.service";
import type { TimeEntry } from "../api/time-entries.service";
import { MIN_BREAK_MINUTES } from "../lib/day-summary";
import { formatClockTime, formatMinutes, minutesBetween } from "@/lib/time";

interface TodayEntriesListProps {
  entries: TimeEntry[];
}

type Row = { kind: "entry"; entry: TimeEntry } | { kind: "break"; minutes: number };

/** Sorts by start time and folds idle gaps between entries into single "break" rows. */
function buildRows(entries: TimeEntry[]): Row[] {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  const rows: Row[] = [];
  let prevEnd: string | null = null;

  for (const entry of sorted) {
    if (prevEnd && entry.startTime > prevEnd) {
      const gap = minutesBetween(prevEnd, entry.startTime);
      if (gap >= MIN_BREAK_MINUTES) rows.push({ kind: "break", minutes: Math.round(gap) });
    }
    rows.push({ kind: "entry", entry });
    if (entry.endTime && (!prevEnd || entry.endTime > prevEnd)) prevEnd = entry.endTime;
  }

  return rows;
}

/**
 * Today's Timeline — read-only, chronological. Idle gaps between sessions
 * are folded into a single "Break · Xm" divider (not one row per gap), so a
 * day with several breaks reads as one clean sequence instead of a wall of
 * duplicate rows. Entries are recorded by the timer and cannot be edited here.
 */
export function TodayEntriesList({ entries }: TodayEntriesListProps) {
  const { data: projects } = useQuery({ queryKey: ["catalog", "projects"], queryFn: listProjects });

  const projectName = (id: string | null) =>
    (id && projects?.find((p) => p.id === id)?.name) || "No project";

  const rows = buildRows(entries);

  return (
    <SectionCard title="Today's Timeline">
      {entries.length === 0 ? (
        <EmptyState message="Nothing logged yet today — start the timer to begin your session." />
      ) : (
        <ol className="flex flex-col">
          {rows.map((row, i) =>
            row.kind === "break" ? (
              <li
                key={`break-${i}`}
                className="flex items-center gap-2.5 border-t border-dashed border-[#c3c6d2]/50 py-2 pl-1 text-xs text-brand-muted"
              >
                <Coffee className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
                <span className="font-semibold">Break</span>
                <span>· {formatMinutes(row.minutes)}</span>
              </li>
            ) : (
              <li
                key={row.entry.id}
                className={
                  i === 0
                    ? "flex items-center gap-4 py-3"
                    : "flex items-center gap-4 border-t border-[#c3c6d2]/40 py-3"
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-brand-ink">
                    {projectName(row.entry.projectId)}
                  </p>
                  <p className="truncate text-xs text-brand-muted">
                    {row.entry.description || "No description"}
                  </p>
                  {row.entry.deliverables ? (
                    <p className="truncate text-[11px] text-brand-muted/80">
                      <span className="font-semibold">Deliverables:</span> {row.entry.deliverables}
                    </p>
                  ) : null}
                </div>
                <span className="hidden text-sm text-brand-muted sm:block">
                  {formatClockTime(row.entry.startTime)}
                  {" → "}
                  {row.entry.endTime ? formatClockTime(row.entry.endTime) : "now"}
                </span>
                {row.entry.endTime ? (
                  <StatusBadge
                    label={formatMinutes(
                      row.entry.durationMinutes ?? minutesBetween(row.entry.startTime, row.entry.endTime),
                    )}
                    tone="info"
                  />
                ) : (
                  <StatusBadge label="Running" tone="success" />
                )}
              </li>
            ),
          )}
        </ol>
      )}
    </SectionCard>
  );
}

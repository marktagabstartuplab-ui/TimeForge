"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ConfirmationDialog } from "@/components/shared/ConfirmationDialog";
import { deleteTimeEntry, type TimeEntry } from "../api/time-entries.service";
import { listProjects } from "../api/catalog.service";
import { formatClockTime, formatMinutes, minutesBetween } from "@/lib/time";

interface TodayEntriesListProps {
  entries: TimeEntry[];
}

/** Today's logged sessions with delete for entries not yet on a timesheet. */
export function TodayEntriesList({ entries }: TodayEntriesListProps) {
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<TimeEntry | null>(null);
  const { data: projects } = useQuery({ queryKey: ["catalog", "projects"], queryFn: listProjects });

  const projectName = (id: string | null) =>
    (id && projects?.find((p) => p.id === id)?.name) || "No project";

  const remove = useMutation({
    mutationFn: (entry: TimeEntry) => deleteTimeEntry(entry.id, entry.version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      setPendingDelete(null);
    },
  });

  return (
    <SectionCard title="Today's Entries">
      {entries.length === 0 ? (
        <EmptyState message="Nothing logged yet today — start the timer or add a manual entry." />
      ) : (
        <ul className="flex flex-col">
          {entries.map((entry, i) => (
            <li
              key={entry.id}
              className={
                i === 0
                  ? "flex items-center gap-4 py-3"
                  : "flex items-center gap-4 border-t border-[#c3c6d2]/40 py-3"
              }
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-brand-ink">
                  {projectName(entry.projectId)}
                </p>
                <p className="truncate text-xs text-brand-muted">
                  {entry.description || "No description"}
                </p>
              </div>
              <span className="hidden text-sm text-brand-muted sm:block">
                {formatClockTime(entry.startTime)}
                {" → "}
                {entry.endTime ? formatClockTime(entry.endTime) : "now"}
              </span>
              {entry.endTime ? (
                <StatusBadge
                  label={formatMinutes(
                    entry.durationMinutes ?? minutesBetween(entry.startTime, entry.endTime),
                  )}
                  tone="info"
                />
              ) : (
                <StatusBadge label="Running" tone="success" />
              )}
              <button
                type="button"
                aria-label={`Delete entry for ${projectName(entry.projectId)}`}
                disabled={Boolean(entry.timesheetId) || !entry.endTime}
                title={
                  entry.timesheetId
                    ? "Already attached to a timesheet"
                    : !entry.endTime
                      ? "Stop the timer first"
                      : "Delete entry"
                }
                onClick={() => setPendingDelete(entry)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-brand-muted hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmationDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="Delete time entry?"
        description="This removes the logged session permanently. You can log it again manually if needed."
        confirmLabel="Delete entry"
        destructive
        pending={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete)}
      />
    </SectionCard>
  );
}

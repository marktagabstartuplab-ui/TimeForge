"use client";

import type { ToastState } from "@/components/shared/Toast";
import type { Department } from "@/features/auth/api/auth.service";
import type { ScrumTask } from "@/features/scrum/api/scrum.service";
import type { TimeEntry } from "../../api/time-entries.service";
import type { DaySummary } from "../../lib/day-summary";
import type { WorkTask } from "../../lib/task-select";
import { CurrentSessionCard } from "../CurrentSessionCard";
import { WorkDetailsCard } from "../WorkDetailsCard";
import { TodayEntriesList } from "../TodayEntriesList";
import { TodayProgressCard } from "../TodayProgressCard";

interface WorkTabProps {
  summary: DaySummary;
  entries: TimeEntry[];
  entriesFetching: boolean;
  weekEntries: TimeEntry[];
  weekLoading: boolean;
  selectedTask: WorkTask | null;
  /** The entry Work Details writes to — running, or today's latest while on break. */
  editableEntry: TimeEntry | null;
  profileDepartmentId: string | null;
  departments: Department[];
  plannedTasks: ScrumTask[];
  onToast: (toast: ToastState) => void;
  /** Time Out inside the session card jumps straight to the review step. */
  onTimeOut: () => void;
  reviewReady: boolean;
  reviewBlockedReason: string | null;
}

/**
 * Step 2 — Log your work. Timer plus Work Details, with today's entries and the
 * progress chart as supporting context. No planner and no EOD fields here.
 */
export function WorkTab({
  summary,
  entries,
  entriesFetching,
  weekEntries,
  weekLoading,
  selectedTask,
  editableEntry,
  profileDepartmentId,
  departments,
  plannedTasks,
  onToast,
  onTimeOut,
  reviewReady,
  reviewBlockedReason,
}: WorkTabProps) {
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <CurrentSessionCard
          selectedTask={selectedTask}
          runningTask={summary.running?.task ?? null}
          runningProjectId={summary.running?.projectId ?? null}
          runningClientId={summary.running?.clientId ?? null}
          loading={entriesFetching}
          onTimeOut={onTimeOut}
          reviewReady={reviewReady}
          reviewBlockedReason={reviewBlockedReason}
        />

        <TodayEntriesList entries={entries} />
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <TodayProgressCard summary={summary} weekEntries={weekEntries} weekLoading={weekLoading} />
      </div>
    </div>
  );
}

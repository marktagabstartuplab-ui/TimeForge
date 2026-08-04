"use client";

import { Clock3Icon } from "lucide-react";
import type { ToastState } from "@/components/shared/Toast";
import type { ScrumEntry, ScrumTask } from "@/features/scrum/api/scrum.service";
import type { ScrumPlanPrefill, WorkTask } from "../../lib/task-select";
import { ScrumTaskCard } from "../ScrumTaskCard";
import { QuickSelectRail } from "../QuickSelectRail";

interface PlanTabProps {
  scrumEntry: ScrumEntry | null;
  loading: boolean;
  prefill: ScrumPlanPrefill | null;
  onToast: (toast: ToastState) => void;
  /** Recent tasks (this week) for one-click planning. */
  tasks: WorkTask[];
  tasksLoading: boolean;
  onSelectTask: (task: WorkTask) => void;
  carryOver: ScrumTask[];
  carryOverDate: string | null;
  onSelectCarryOver: (task: ScrumTask) => void;
}

/** "08:42 AM" for the shift clock strip. */
function formatClock(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Step 1 — Plan your day. Today's Commitments only: the planner card plus the
 * Quick Select rail that feeds it. Work Details, today's entries and the EOD
 * review live on later steps so this view fits above the fold.
 */
export function PlanTab({
  scrumEntry,
  loading,
  prefill,
  onToast,
  tasks,
  tasksLoading,
  onSelectTask,
  carryOver,
  carryOverDate,
  onSelectCarryOver,
}: PlanTabProps) {
  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 rounded-[12px] border border-[#c3c6d2]/50 bg-[#f6f3f4] px-4 py-3 text-sm text-brand-navy">
        <Clock3Icon className="h-[18px] w-[18px] shrink-0 text-brand" aria-hidden="true" />
        <span>
          It&apos;s <span className="font-bold">{formatClock(now)}</span> — list what you&apos;re
          committing to today, then move on to logging your work.
        </span>
      </p>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ScrumTaskCard entry={scrumEntry} loading={loading} prefill={prefill} onToast={onToast} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <QuickSelectRail
            tasks={tasks}
            loading={tasksLoading}
            onSelect={onSelectTask}
            carryOver={carryOver}
            carryOverDate={carryOverDate}
            onSelectCarryOver={onSelectCarryOver}
            onToast={onToast}
          />
        </div>
      </div>
    </div>
  );
}

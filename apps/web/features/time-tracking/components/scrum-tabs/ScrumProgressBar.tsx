"use client";

import { ProgressBar } from "@/components/shared/ProgressBar";

interface ScrumProgressBarProps {
  /** Number of completed workflow steps (0–4). */
  completed: number;
  total: number;
}

/** "Almost done" style encouragement — keyed off how many steps remain. */
function encouragement(remaining: number): string {
  if (remaining === 0) return "All done for today. Nice work!";
  if (remaining === 1) return "One step to go — almost done.";
  return `${remaining} steps left. You're doing great.`;
}

/**
 * Workflow progress for the Daily Scrum tabs. Sits above the tab bar so the
 * employee can see how much of the day's scrum is still outstanding without
 * opening each step.
 */
export function ScrumProgressBar({ completed, total }: ScrumProgressBarProps) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const remaining = Math.max(0, total - completed);

  return (
    <div className="rounded-[12px] border border-[#c3c6d2]/50 bg-white px-4 py-3 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[1px] text-brand-muted">
          Daily Scrum progress
        </p>
        <p className="text-sm font-bold text-brand">{percent}% complete</p>
      </div>
      <ProgressBar
        percent={percent}
        label="Daily Scrum completion"
        className="mt-2"
        barClassName={percent === 100 ? "bg-[#16a34a]" : undefined}
      />
      <p className="mt-2 text-xs text-brand-muted">{encouragement(remaining)}</p>
    </div>
  );
}

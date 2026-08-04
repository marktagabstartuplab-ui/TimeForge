"use client";

import { CheckCircle2Icon, ClockIcon, CoffeeIcon, SunsetIcon, TargetIcon } from "lucide-react";
import type { ScrumTask } from "@/features/scrum/api/scrum.service";
import type { DaySummary } from "../../lib/day-summary";
import { ScrumHistoryCard } from "../ScrumHistoryCard";
import { formatMinutes } from "@/lib/time";

interface ReviewTabProps {
  summary: DaySummary;
  /** Today's planned commitments, with whatever status they currently carry. */
  commitments: ScrumTask[];
  /** Opens the existing End of Day Review modal — the one and only submit path. */
  onOpenReview: () => void;
  reviewReady: boolean;
  reviewBlockedReason: string | null;
  alreadyReviewed: boolean;
}

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-[#c3c6d2]/50 bg-[#f6f3f4] px-4 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-cyan/20 text-brand">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">{label}</p>
        <p className="truncate text-xl font-bold text-brand-ink">{value}</p>
      </div>
    </div>
  );
}

/**
 * Step 3 — End of day review. Shows what the day actually produced and opens
 * the existing EodReviewModal, which owns the review form and the submission
 * (unchanged: it still records actuals, clocks out and locks the entry).
 */
export function ReviewTab({
  summary,
  commitments,
  onOpenReview,
  reviewReady,
  reviewBlockedReason,
  alreadyReviewed,
}: ReviewTabProps) {
  const completed = commitments.filter((t) => t.taskStatus === "COMPLETED").length;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-[12px] border border-[#c3c6d2]/50 bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)] sm:p-5">
        <h2 className="text-base font-bold text-brand-ink">Today&apos;s summary</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            icon={<ClockIcon className="h-5 w-5" aria-hidden="true" />}
            label="Total tracked"
            value={formatMinutes(summary.trackedMinutes)}
          />
          <StatTile
            icon={<CoffeeIcon className="h-5 w-5" aria-hidden="true" />}
            label="Break time"
            value={formatMinutes(summary.breakMinutes)}
          />
          <StatTile
            icon={<CheckCircle2Icon className="h-5 w-5" aria-hidden="true" />}
            label="Commitments done"
            value={`${completed}/${commitments.length}`}
          />
        </div>

        <p className="mt-5 mb-2 text-xs font-bold uppercase tracking-[1px] text-brand-muted">
          Today&apos;s commitments
        </p>
        {commitments.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {commitments.map((task) => (
              <li
                key={task.id}
                className="flex items-start justify-between gap-3 rounded-[10px] border border-[#c3c6d2]/50 px-3 py-2.5"
              >
                <span className="flex min-w-0 items-start gap-2.5">
                  <TargetIcon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-brand-ink">{task.title}</span>
                    {task.plannedTarget ? (
                      <span className="block text-xs text-brand-muted">
                        Target: {task.plannedTarget}
                        {task.actualCompleted ? ` · Actual: ${task.actualCompleted}` : ""}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span
                  className={
                    task.taskStatus === "COMPLETED"
                      ? "shrink-0 rounded-full bg-[#f0fdf4] px-2.5 py-0.5 text-xs font-bold text-[#16a34a]"
                      : "shrink-0 rounded-full bg-[#f6f3f4] px-2.5 py-0.5 text-xs font-bold text-brand-muted"
                  }
                >
                  {task.taskStatus === "COMPLETED"
                    ? "Completed"
                    : task.taskStatus === "IN_PROGRESS"
                      ? "In progress"
                      : "Pending"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[10px] bg-[#f6f3f4] px-4 py-3 text-sm text-brand-muted">
            No commitments planned today — add them on the Plan step first.
          </p>
        )}

        <div className="mt-5 border-t border-[#c3c6d2]/40 pt-4">
          <button
            type="button"
            onClick={onOpenReview}
            disabled={!reviewReady}
            title={reviewReady ? undefined : reviewBlockedReason ?? undefined}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-brand px-6 text-sm font-bold text-white shadow-[0_2px_0_rgba(0,0,0,0.15)] transition-colors hover:bg-[#1467d6] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            <SunsetIcon className="h-[18px] w-[18px]" aria-hidden="true" />
            {alreadyReviewed ? "Day reviewed" : "Open End of Day Review"}
          </button>
          {!reviewReady && reviewBlockedReason ? (
            <p className="mt-2 text-xs text-brand-muted">{reviewBlockedReason}</p>
          ) : null}
        </div>
      </section>

      {/* Reference data — collapsed by default so the review itself stays
          above the fold (design ref: "collapse below fold: history"). */}
      <details className="rounded-[12px] border border-[#c3c6d2]/50 bg-white">
        <summary className="flex min-h-[44px] cursor-pointer items-center px-4 text-sm font-bold text-brand">
          Past scrum entries
        </summary>
        <div className="px-2 pb-2">
          <ScrumHistoryCard />
        </div>
      </details>
    </div>
  );
}

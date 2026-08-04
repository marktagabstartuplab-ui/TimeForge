"use client";

import { CheckCircle2Icon, CircleIcon, LockIcon, TriangleAlertIcon } from "lucide-react";

interface ChecklistItem {
  label: string;
  done: boolean;
}

interface SubmitTabProps {
  checklist: ChecklistItem[];
  /** Opens the existing End of Day Review modal, which performs the submit. */
  onOpenReview: () => void;
  reviewReady: boolean;
  reviewBlockedReason: string | null;
  alreadyReviewed: boolean;
}

/**
 * Step 4 — Submit for approval. A confirmation view only: it restates what the
 * submit will lock and hands off to EodReviewModal. No submission logic lives
 * here.
 */
export function SubmitTab({
  checklist,
  onOpenReview,
  reviewReady,
  reviewBlockedReason,
  alreadyReviewed,
}: SubmitTabProps) {
  return (
    <section className="rounded-[12px] border border-[#c3c6d2]/50 bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)] sm:p-5">
      <h2 className="text-base font-bold text-brand-ink">
        {alreadyReviewed ? "Submitted" : "Ready to submit?"}
      </h2>
      <p className="mt-1 text-sm text-brand-muted">
        {alreadyReviewed
          ? "Today's scrum has been submitted and locked. Ask your supervisor to unlock it if something needs changing."
          : "Review your daily scrum before it is locked for supervisor review."}
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {checklist.map((item) => (
          <li key={item.label} className="flex items-center gap-2.5 text-sm">
            {item.done ? (
              <CheckCircle2Icon className="h-[18px] w-[18px] shrink-0 text-[#16a34a]" aria-hidden="true" />
            ) : (
              <CircleIcon className="h-[18px] w-[18px] shrink-0 text-brand-muted" aria-hidden="true" />
            )}
            <span className={item.done ? "font-medium text-brand-ink" : "text-brand-muted"}>
              {item.label}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-5 rounded-[10px] bg-[#f6f3f4] px-4 py-3">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[1px] text-brand-muted">
          <LockIcon className="h-4 w-4" aria-hidden="true" />
          After submission
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm text-brand-navy">
          <li>Your scrum entry is locked and you are timed out.</li>
          <li>Your supervisor can review and comment on it.</li>
          <li>You can request an edit if something needs correcting.</li>
        </ul>
      </div>

      {!alreadyReviewed ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-[#b45309]">
          <TriangleAlertIcon className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          You&apos;ll fill in your accomplishments and confirm before anything is saved.
        </p>
      ) : null}

      <div className="mt-4 border-t border-[#c3c6d2]/40 pt-4">
        <button
          type="button"
          onClick={onOpenReview}
          disabled={!reviewReady}
          title={reviewReady ? undefined : reviewBlockedReason ?? undefined}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-brand px-6 text-sm font-bold text-white shadow-[0_2px_0_rgba(0,0,0,0.15)] transition-colors hover:bg-[#1467d6] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          <LockIcon className="h-[18px] w-[18px]" aria-hidden="true" />
          {alreadyReviewed ? "Scrum submitted" : "Submit & Lock Scrum"}
        </button>
        {!reviewReady && reviewBlockedReason ? (
          <p className="mt-2 text-xs text-brand-muted">{reviewBlockedReason}</p>
        ) : null}
      </div>
    </section>
  );
}

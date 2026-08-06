"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, Coffee, Loader2, LogOut, Target } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogCloseButton,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmationDialog } from "@/components/shared/ConfirmationDialog";
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FormBanner } from "@/features/auth/components/FormMessages";
import {
  createScrumEntry,
  getScrumEntry,
  listScrumEntries,
  listScrumTasks,
  updateScrumEntry,
  updateScrumTask,
  type ScrumEntry,
  type ScrumTask,
} from "@/features/scrum/api/scrum.service";
import { clockOutSession, getCurrentWorkSession } from "../api/work-sessions.service";
import type { DaySummary } from "../lib/day-summary";
import { eodReviewSchema, type EodReviewValues } from "../schemas/time-entry.schema";
import { formatMinutes, toIsoDate } from "@/lib/time";

interface EodReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: DaySummary;
  /** Today's scrum entry, when one exists (its "today" text = commitments). */
  scrumEntry: ScrumEntry | null;
  /** Fired after the review is stored and the timer stopped. */
  onSubmitted?: () => void;
}

/** Leading numeric prefix of a target string ("50", "50 calls" → 50); null when non-numeric. */
function parseNumericTarget(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = String(value).trim().match(/^-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A commitment participates in the actual-vs-planned flow only if it carries a numeric planned target. */
function isKpiLinked(task: ScrumTask): boolean {
  return parseNumericTarget(task.plannedTarget) !== null;
}

/** Per-commitment EOD answers, keyed by task id. */
interface TaskReview {
  actual: string;
  continueTomorrow: boolean | null;
  reason: string;
}

const EMPTY_REVIEW: TaskReview = { actual: "", continueTomorrow: null, reason: "" };

/**
 * One commitment in the review. KPI-linked commitments (those with a numeric
 * Planned Target) get the mandatory "Actual Completed" input plus the shortfall
 * follow-ups; everything else keeps the plain status badge.
 */
function CommitmentReviewRow({
  task,
  review,
  error,
  onChange,
}: {
  task: ScrumTask;
  review: TaskReview;
  error?: string;
  onChange: (patch: Partial<TaskReview>) => void;
}) {
  const planned = parseNumericTarget(task.plannedTarget);
  const actual = parseNumericTarget(review.actual);
  const answered = review.actual.trim() !== "" && actual !== null && actual >= 0;
  // A zero target is trivially met — treat it as 100% rather than dividing by zero.
  const percent = answered && planned !== null ? (planned > 0 ? Math.round((actual / planned) * 100) : 100) : null;
  const shortfall = answered && planned !== null && actual < planned;

  return (
    <li className="rounded-[12px] border border-[#c3c6d2]/50 bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Target className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-brand-ink">{task.title}</p>
            {task.expectedOutput ? (
              <p className="mt-0.5 text-xs text-brand-muted">{task.expectedOutput}</p>
            ) : null}
            {task.kpi ? (
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-brand-muted">{task.kpi}</p>
            ) : null}
          </div>
        </div>
        {planned === null ? (
          <span
            className={
              task.taskStatus === "COMPLETED"
                ? "shrink-0 rounded-full bg-[#f0fdf4] px-2.5 py-0.5 text-xs font-bold text-[#16a34a]"
                : "shrink-0 rounded-full bg-[#f6f3f4] px-2.5 py-0.5 text-xs font-bold text-brand-muted"
            }
          >
            {task.taskStatus === "COMPLETED" ? "Completed" : task.taskStatus === "IN_PROGRESS" ? "In progress" : "Pending"}
          </span>
        ) : percent !== null ? (
          <span
            className={
              shortfall
                ? "shrink-0 rounded-full bg-[#fef2f2] px-2.5 py-0.5 text-xs font-bold text-[#dc2626]"
                : "shrink-0 rounded-full bg-[#f0fdf4] px-2.5 py-0.5 text-xs font-bold text-[#16a34a]"
            }
          >
            {percent}% {shortfall ? "Below target" : percent > 100 ? "Above target" : "On target"}
          </span>
        ) : null}
      </div>

      {planned !== null ? (
        <div className="mt-3 space-y-3 border-t border-[#c3c6d2]/40 pt-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">Planned Target</p>
              <p className="mt-1 text-sm font-bold text-brand-ink">{task.plannedTarget}</p>
            </div>
            <div className="min-w-[140px]">
              <label
                htmlFor={`eod-actual-${task.id}`}
                className="text-[10px] font-bold uppercase tracking-[1px] text-brand-muted"
              >
                Actual Completed <span className="text-red-600">*</span>
              </label>
              <input
                id={`eod-actual-${task.id}`}
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={review.actual}
                onChange={(event) => onChange({ actual: event.target.value })}
                aria-invalid={Boolean(error)}
                className={
                  error
                    ? "mt-1 h-10 w-full rounded-[10px] border border-red-400 bg-white px-3 text-sm text-brand-ink outline-none focus:border-red-500"
                    : "mt-1 h-10 w-full rounded-[10px] border border-[#c3c6d2] bg-white px-3 text-sm text-brand-ink outline-none focus:border-brand"
                }
              />
            </div>
          </div>

          {shortfall ? (
            <div className="space-y-3 rounded-[10px] bg-[#fef2f2] px-3 py-3">
              <fieldset>
                <legend className="text-xs font-bold text-[#b91c1c]">Will you continue this tomorrow?</legend>
                <div className="mt-2 flex gap-4">
                  {[
                    { label: "Yes", value: true },
                    { label: "No", value: false },
                  ].map((option) => (
                    <label key={option.label} className="flex cursor-pointer items-center gap-2 text-sm text-brand-ink">
                      <input
                        type="radio"
                        name={`eod-continue-${task.id}`}
                        checked={review.continueTomorrow === option.value}
                        onChange={() => onChange({ continueTomorrow: option.value })}
                        className="size-4 accent-[#dc2626]"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label
                  htmlFor={`eod-reason-${task.id}`}
                  className="text-xs font-bold text-[#b91c1c]"
                >
                  Why was this not completed? <span className="text-red-600">*</span>
                </label>
                <Textarea
                  id={`eod-reason-${task.id}`}
                  rows={2}
                  value={review.reason}
                  onChange={(event) => onChange({ reason: event.target.value })}
                  placeholder="What got in the way?"
                  invalid={Boolean(error)}
                  className="mt-1"
                />
              </div>
            </div>
          ) : null}

          <FieldError message={error} />
        </div>
      ) : null}
    </li>
  );
}

/**
 * End of Day Review (Figma 127:3271). Stops the running timer
 * (POST /time-entries/:id/stop), records each KPI-linked commitment's actual
 * result against its planned target (PATCH /scrum-entries/tasks/:id), and folds
 * the narrative review into today's scrum entry (accomplishments → `today`,
 * blockers → `blockers`).
 *
 * BACKEND GAPS — no dedicated EOD endpoint exists, so break duration is derived
 * client-side from gaps between entries and the accuracy confirmation is
 * enforced in the UI but not stored.
 */
export function EodReviewModal({ open, onOpenChange, summary, scrumEntry, onSubmitted }: EodReviewModalProps) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [commitmentDone, setCommitmentDone] = useState(false);
  const [reviews, setReviews] = useState<Record<string, TaskReview>>({});
  const [taskErrors, setTaskErrors] = useState<Record<string, string>>({});
  // Values staged by the submit handler, awaiting the confirmation dialog.
  const [pendingSubmit, setPendingSubmit] = useState<EodReviewValues | null>(null);
  // Latest known optimistic-lock version per task, seeded from the cached list and
  // advanced by each successful write. A failed submit leaves some tasks already
  // written (and version-bumped), so a plain retry off the cached list would 409;
  // this keeps retries working without refetching over the user's typed answers.
  const taskVersions = useRef<Record<string, number>>({});

  const { data: workSession } = useQuery({
    queryKey: ["work-session", "current"],
    queryFn: getCurrentWorkSession,
    enabled: open,
  });

  // Fetch today's scrum fresh when the review opens so locked commitments always
  // show on the first time-out (QA #13) — the parent's cached copy can lag. Use
  // the freshest version for both display and the submit's optimistic-lock check.
  const { data: freshScrum } = useQuery({
    queryKey: ["scrum-entries", "today", "eod"],
    queryFn: () => listScrumEntries({ from: toIsoDate(new Date()), to: toIsoDate(new Date()), limit: 1 }),
    enabled: open,
  });
  const scrum = freshScrum?.data[0] ?? scrumEntry;

  // The plan lives in ScrumTask rows (task-driven flow) — the legacy `today`
  // free text is created empty, so commitments must come from the tasks. Same
  // query key as ScrumTaskCard/TimeTrackingContent → served from the shared cache.
  const { data: scrumTasks } = useQuery({
    queryKey: ["scrum-tasks", scrum?.id],
    queryFn: () => listScrumTasks(scrum!.id),
    enabled: open && Boolean(scrum),
  });
  const commitments = scrumTasks ?? [];

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EodReviewValues>({
    resolver: zodResolver(eodReviewSchema),
    defaultValues: { accomplishments: "", finalBlockers: "", confirmed: false },
  });

  // Clear the form every time the modal opens so a second EOD review doesn't
  // pre-fill with text from the previous submission.
  useEffect(() => {
    if (open) {
      reset({ accomplishments: "", finalBlockers: "", confirmed: false });
      setServerError(null);
      setCommitmentDone(false);
      setTaskErrors({});
      setPendingSubmit(null);
      taskVersions.current = {};
    }
  }, [open, reset]);

  // Seed the per-commitment answers from whatever was already reported (the
  // inline "Actual Completed" field on ScrumTaskCard writes the same columns),
  // so re-opening the review doesn't wipe an earlier entry.
  useEffect(() => {
    if (!open) return;
    setReviews(
      Object.fromEntries(
        commitments.map((task) => [
          task.id,
          {
            actual: task.actualCompleted ?? "",
            continueTomorrow: task.continueTomorrow ?? null,
            reason: task.notCompletedReason ?? "",
          },
        ]),
      ),
    );
  }, [open, scrumTasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchReview = (taskId: string, patch: Partial<TaskReview>) => {
    setReviews((prev) => ({ ...prev, [taskId]: { ...(prev[taskId] ?? EMPTY_REVIEW), ...patch } }));
    setTaskErrors((prev) => {
      if (!prev[taskId]) return prev;
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  /** Empty when every KPI-linked commitment is answered; otherwise error text by task id. */
  const validateCommitments = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    for (const task of commitments) {
      if (!isKpiLinked(task)) continue;
      const planned = parseNumericTarget(task.plannedTarget)!;
      const review = reviews[task.id] ?? EMPTY_REVIEW;
      const actual = parseNumericTarget(review.actual);

      if (review.actual.trim() === "") {
        errs[task.id] = "Enter what you actually completed";
      } else if (actual === null || actual < 0) {
        errs[task.id] = "Enter a number of 0 or more";
      } else if (actual < planned) {
        if (review.continueTomorrow === null) {
          errs[task.id] = "Tell us whether you'll continue this tomorrow";
        } else if (!review.reason.trim()) {
          errs[task.id] = "Explain why this wasn't completed";
        }
      }
    }
    return errs;
  };

  const submit = useMutation({
    mutationFn: async (values: EodReviewValues) => {
      // Persist the per-commitment actuals BEFORE clocking out — if a task write
      // fails (stale version, locked entry) the user is still on the clock and
      // can retry, rather than being timed out with the numbers lost.

      // Pass 1 — KPI-linked commitments: record actuals and derive status from
      // whether the numeric target was met.
      for (const task of commitments) {
        if (!isKpiLinked(task)) continue;
        const planned = parseNumericTarget(task.plannedTarget)!;
        const review = reviews[task.id] ?? EMPTY_REVIEW;
        const actual = parseNumericTarget(review.actual)!;
        const shortfall = actual < planned;
        const updated = await updateScrumTask(task.id, {
          actualCompleted: review.actual.trim(),
          taskStatus: shortfall ? "IN_PROGRESS" : "COMPLETED",
          continueTomorrow: shortfall ? review.continueTomorrow ?? false : false,
          notCompletedReason: shortfall ? review.reason.trim() : "",
          version: taskVersions.current[task.id] ?? task.version,
        });
        taskVersions.current[task.id] = updated.version;
      }

      // Pass 2 — Non-KPI commitments (no numeric planned target): mark COMPLETED
      // at EOD unless they were already marked complete by the employee earlier.
      // These tasks have no measurable shortfall, so EOD submission = implicit
      // completion. The backend's isEodReportOnly() guard allows this write even
      // on a locked entry (taskStatus is an EOD-report field, not a plan edit).
      for (const task of commitments) {
        if (isKpiLinked(task)) continue;
        if (task.taskStatus === "COMPLETED") continue;
        const updated = await updateScrumTask(task.id, {
          taskStatus: "COMPLETED",
          version: taskVersions.current[task.id] ?? task.version,
        });
        taskVersions.current[task.id] = updated.version;
      }

      if (workSession?.session?.isActive) {
        await clockOutSession();
      }
      const eodLine = `EOD Review — ${values.accomplishments}`;
      if (scrum) {
        // Re-read the entry immediately before writing it. Each task write above
        // runs recalcEntryProgress() server-side, which bumps the PARENT entry's
        // version — so the copy we opened the modal with is stale by exactly the
        // number of commitments we just saved, and reusing it always 409s. This
        // is our own write chain, not a competing editor, so re-reading here
        // resolves the self-inflicted bump while leaving the optimistic lock
        // intact for the fields we actually carry across (today/blockers).
        const current = await getScrumEntry(scrum.id);
        // Keep only the morning commitment (everything before any prior EOD line)
        // and replace the EOD line — re-submitting the review must not append a
        // second "EOD Review —" block and duplicate Today's Commitments (QA #15).
        const morningCommitment = (current.today ?? "").split("\n\nEOD Review —")[0];
        return updateScrumEntry(scrum.id, {
          today: [morningCommitment, eodLine].filter(Boolean).join("\n\n").slice(0, 5000),
          blockers: values.finalBlockers || current.blockers || undefined,
          version: current.version,
        });
      }
      return createScrumEntry({
        entryDate: toIsoDate(new Date()),
        yesterday: "(Logged at end of day — no morning scrum.)",
        today: eodLine.slice(0, 5000),
        blockers: values.finalBlockers || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["scrum-entries"] });
      queryClient.invalidateQueries({ queryKey: ["scrum-tasks"] });
      // "Continue tomorrow" answers just written here are what Quick Select's
      // Continued Tasks section reads.
      queryClient.invalidateQueries({ queryKey: ["scrum-carry-over"] });
      queryClient.invalidateQueries({ queryKey: ["work-session", "current"] });
      onOpenChange(false);
      onSubmitted?.();
    },
    onError: async (err) => {
      const message = err instanceof Error ? err.message : "Could not submit your review";
      const conflict = /version mismatch/i.test(message);
      setServerError(
        conflict
          ? "Your commitments were updated elsewhere while you were writing this review. We've refreshed them — press Submit Review & Time Out again to finish."
          : message,
      );
      // Resync versions so the retry isn't stuck behind a stale lock token. Read
      // directly rather than invalidating the query — invalidation would re-seed
      // the form effect and wipe the answers the user just typed.
      if (!scrum) return;
      try {
        const fresh = await listScrumTasks(scrum.id);
        for (const task of fresh) taskVersions.current[task.id] = task.version;
      } catch {
        // Best-effort — the user can still close and reopen the review.
      }
    },
  });

  // Confirmation gate (BUG-AI). Validation runs first so the dialog never opens
  // on a review that is about to be rejected anyway; the values are staged and
  // only dispatched when the user confirms. Cancel writes nothing and keeps
  // every answer already typed into the review.
  const onSubmit = (values: EodReviewValues) => {
    setServerError(null);
    const errs = validateCommitments();
    setTaskErrors(errs);
    if (Object.keys(errs).length > 0) {
      setServerError("Please complete the actual results for each commitment below.");
      return;
    }
    setPendingSubmit(values);
  };

  const confirmSubmit = () => {
    if (!pendingSubmit) return;
    const values = pendingSubmit;
    setPendingSubmit(null);
    submit.mutate(values);
  };

  const dateLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <div className="flex items-start justify-between bg-brand px-6 py-5">
          <div>
            <DialogTitle className="text-[26px] font-bold text-white">End of Day Review</DialogTitle>
            <p className="mt-0.5 text-sm text-white/80">{dateLabel}</p>
          </div>
          <DialogCloseButton className="text-white hover:bg-white/15" />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {serverError ? <FormBanner message={serverError} /> : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-[12px] border border-[#c3c6d2]/50 bg-[#f6f3f4] px-4 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-cyan/20 text-brand">
                  <Clock3 className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">Total Tracked</p>
                  {summary.trackedMinutes > 1440 ? (
                    <p className="text-sm font-bold text-red-600" title="Total tracked time cannot exceed 24 hours in a single day">
                      Error (&gt;24h)
                    </p>
                  ) : (
                    <p className="text-xl font-bold text-brand">{formatMinutes(summary.trackedMinutes)}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-[12px] border border-[#c3c6d2]/50 bg-[#f6f3f4] px-4 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-cyan/20 text-brand">
                  <Coffee className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[1px] text-brand-muted">Break Duration</p>
                  <p className="text-xl font-bold text-brand-ink">{formatMinutes(summary.breakMinutes)}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[1px] text-brand-muted">
                Today&apos;s Commitments
              </p>
              {commitments.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {commitments.map((task) => (
                    <CommitmentReviewRow
                      key={task.id}
                      task={task}
                      review={reviews[task.id] ?? EMPTY_REVIEW}
                      error={taskErrors[task.id]}
                      onChange={(patch) => patchReview(task.id, patch)}
                    />
                  ))}
                </ul>
              ) : scrum?.today ? (
                <div className="rounded-[12px] border border-[#c3c6d2]/50 bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Target className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                      <p className="whitespace-pre-wrap text-sm font-semibold text-brand-ink">{scrum.today}</p>
                    </div>
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-bold text-brand">
                      {commitmentDone ? "Completed" : "Mark done"}
                      <Checkbox
                        checked={commitmentDone}
                        onCheckedChange={(checked) => setCommitmentDone(checked === true)}
                        className="size-5 rounded-[6px]"
                      />
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-brand-muted/80">
                    Completion tracking is visual only — needs backend support.
                  </p>
                </div>
              ) : (
                <p className="rounded-[12px] bg-[#f6f3f4] px-4 py-3 text-sm text-brand-muted">
                  No scrum entry for today — your commitments would appear here.
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="eod-accomplishments"
                className="mb-2 block text-xs font-bold uppercase tracking-[1px] text-brand-muted"
              >
                Daily Accomplishments
              </label>
              <Textarea
                id="eod-accomplishments"
                rows={3}
                placeholder="Briefly describe what you achieved today..."
                invalid={Boolean(errors.accomplishments)}
                {...register("accomplishments")}
              />
              <FieldError message={errors.accomplishments?.message} />
            </div>

            <div>
              <label
                htmlFor="eod-blockers"
                className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[1px] text-brand-muted"
              >
                Final Blockers / Notes
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold normal-case tracking-normal text-red-600">
                  Urgent
                </span>
              </label>
              <Textarea
                id="eod-blockers"
                rows={3}
                placeholder="List any items for tomorrow's scrum..."
                invalid={Boolean(errors.finalBlockers)}
                {...register("finalBlockers")}
              />
              <FieldError message={errors.finalBlockers?.message} />
            </div>

            <div
              className={
                errors.confirmed
                  ? "rounded-[10px] border border-red-300 bg-red-50/50 px-4 py-3"
                  : "rounded-[10px] border border-brand/30 bg-brand-cyan/10 px-4 py-3"
              }
            >
              <label className="flex cursor-pointer items-start gap-3">
                <Controller
                  control={control}
                  name="confirmed"
                  render={({ field }) => (
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      aria-invalid={Boolean(errors.confirmed)}
                      className="mt-0.5 size-5 rounded-[6px] bg-white"
                    />
                  )}
                />
                <span className="text-sm font-medium text-brand">
                  I confirm that all time logs for today are accurate and match the work performed.
                </span>
              </label>
              <FieldError message={errors.confirmed?.message} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[#c3c6d2]/50 bg-white px-6 py-4">
            <DialogClose className="text-sm font-bold text-brand hover:underline">
              Return to Tracker
            </DialogClose>
            <button
              type="submit"
              disabled={submit.isPending}
              className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-brand px-6 text-sm font-bold text-white shadow-[0_2px_0_rgba(0,0,0,0.15)] transition-colors hover:bg-[#1467d6] disabled:opacity-60"
            >
              {submit.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Submit Review &amp; Time Out
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </form>
      </DialogContent>

      {/* Safety net before the write (BUG-AI). Submitting the review records
          every commitment's actuals, locks the day and clocks the employee
          out — three irreversible things behind one click. */}
      <ConfirmationDialog
        open={pendingSubmit !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingSubmit(null);
        }}
        title="Submit your end of day review?"
        description="This records your results for today, locks the entry and times you out. You will not be able to edit it afterward without asking your supervisor to unlock it."
        confirmLabel="Yes, submit and time out"
        pending={submit.isPending}
        onConfirm={confirmSubmit}
      />
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { FieldError, FormBanner } from "@/features/auth/components/FormMessages";
import {
  createScrumEntry,
  listScrumEntries,
  listScrumTasks,
  updateScrumEntry,
  type ScrumEntry,
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

/**
 * End of Day Review (Figma 127:3271). Persists via existing endpoints only:
 * stops the running timer (POST /time-entries/:id/stop) and folds the review
 * into today's scrum entry (accomplishments → `today`, blockers → `blockers`).
 *
 * BACKEND GAPS — no dedicated EOD endpoint exists, so: commitment completion
 * (the design's checkbox + "80% Progress") is display-only, break duration is
 * derived client-side from gaps between entries, and the accuracy
 * confirmation is enforced in the UI but not stored.
 */
export function EodReviewModal({ open, onOpenChange, summary, scrumEntry, onSubmitted }: EodReviewModalProps) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const [commitmentDone, setCommitmentDone] = useState(false);

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
    }
  }, [open, reset]);

  const submit = useMutation({
    mutationFn: async (values: EodReviewValues) => {
      if (workSession?.session?.isActive) {
        await clockOutSession();
      }
      const eodLine = `EOD Review — ${values.accomplishments}`;
      if (scrum) {
        // Keep only the morning commitment (everything before any prior EOD line)
        // and replace the EOD line — re-submitting the review must not append a
        // second "EOD Review —" block and duplicate Today's Commitments (QA #15).
        const morningCommitment = (scrum.today ?? "").split("\n\nEOD Review —")[0];
        return updateScrumEntry(scrum.id, {
          today: [morningCommitment, eodLine].filter(Boolean).join("\n\n").slice(0, 5000),
          blockers: values.finalBlockers || scrum.blockers || undefined,
          version: scrum.version,
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
      queryClient.invalidateQueries({ queryKey: ["work-session", "current"] });
      onOpenChange(false);
      onSubmitted?.();
    },
    onError: (err) =>
      setServerError(err instanceof Error ? err.message : "Could not submit your review"),
  });

  const onSubmit = (values: EodReviewValues) => {
    setServerError(null);
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
                  <p className="text-xl font-bold text-brand">{formatMinutes(summary.trackedMinutes)}</p>
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
                    <li
                      key={task.id}
                      className="flex items-start justify-between gap-3 rounded-[12px] border border-[#c3c6d2]/50 bg-white p-4 shadow-[0px_1px_1px_rgba(0,0,0,0.05)]"
                    >
                      <div className="flex items-start gap-2.5">
                        <Target className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold text-brand-ink">{task.title}</p>
                          {task.expectedOutput ? (
                            <p className="mt-0.5 text-xs text-brand-muted">{task.expectedOutput}</p>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className={
                          task.taskStatus === "COMPLETED"
                            ? "shrink-0 rounded-full bg-[#f0fdf4] px-2.5 py-0.5 text-xs font-bold text-[#16a34a]"
                            : "shrink-0 rounded-full bg-[#f6f3f4] px-2.5 py-0.5 text-xs font-bold text-brand-muted"
                        }
                      >
                        {task.taskStatus === "COMPLETED" ? "Completed" : task.taskStatus === "IN_PROGRESS" ? "In progress" : "Pending"}
                      </span>
                    </li>
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
    </Dialog>
  );
}

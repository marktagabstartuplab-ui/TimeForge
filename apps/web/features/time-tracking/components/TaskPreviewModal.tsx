"use client";

import { ArrowRightCircle, ClipboardList } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { TASK_PROGRESS_STEPS } from "../lib/task-select";

/** One label/value row in the preview. Rows with no value are dropped. */
export interface TaskPreviewField {
  label: string;
  value: string | null | undefined;
}

interface TaskPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** "Recent task" / "Continued task" — what kind of card was clicked. */
  kind: string;
  fields: TaskPreviewField[];
  /**
   * BUG-BV: current Task Progress, 0–100. Provided only for a carried-over
   * commitment (a recent task has no plan to be partway through); omitting it
   * hides the control entirely.
   */
  progress?: number;
  onProgressChange?: (value: number) => void;
  /** Confirmed — the caller performs the actual population. */
  onConfirm: () => void;
}

/**
 * Read-only confirmation step between a Quick Select click and Work Details /
 * the Daily Scrum planner being populated (BUG-AL). Clicking a card used to
 * overwrite the section immediately, interrupting whatever the employee had
 * typed into their current session; nothing is applied until "Load Task".
 */
export function TaskPreviewModal({
  open,
  onOpenChange,
  title,
  kind,
  fields,
  progress,
  onProgressChange,
  onConfirm,
}: TaskPreviewModalProps) {
  const rows = fields.filter((f) => f.value && f.value.trim().length > 0);
  const showProgress = progress !== undefined && onProgressChange !== undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(560px,100%)]" aria-label="Task preview">
        <div className="flex items-start gap-3 border-b border-[#c3c6d2]/40 p-6 pb-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-brand-cyan/20 text-brand">
            <ClipboardList className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-xl">{title}</DialogTitle>
            <DialogDescription>
              {kind} — review the details, then load it into Work Details.
            </DialogDescription>
          </div>
          <DialogCloseButton />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {rows.length > 0 ? (
            <dl className="flex flex-col gap-3.5">
              {rows.map((f) => (
                <div key={f.label}>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-muted">
                    {f.label}
                  </dt>
                  <dd className="mt-0.5 whitespace-pre-line text-sm text-brand-ink">{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="rounded-[10px] bg-[#f6f3f4] px-4 py-3 text-xs text-brand-muted">
              This task has no extra details recorded — only its name.
            </p>
          )}
          {/* BUG-BV — the point of capture for a multi-day task: the employee
              says how far along it already is as they pick it up, so "80%
              complete, finishing the last 20% today" is on the record rather
              than sitting between Not Started and Completed. */}
          {showProgress ? (
            <div className="mt-5 rounded-[10px] border border-[#c3c6d2]/50 bg-white p-4">
              <label
                htmlFor="task-preview-progress"
                className="text-[11px] font-bold uppercase tracking-[0.5px] text-brand-muted"
              >
                Task Progress
              </label>
              <p className="mt-0.5 text-xs text-brand-muted">
                How much of this is already done before today&apos;s work?
              </p>
              <div className="mt-2.5 flex items-center gap-3">
                <input
                  id="task-preview-progress"
                  type="range"
                  min={0}
                  max={100}
                  step={25}
                  value={progress}
                  onChange={(e) => onProgressChange(Number(e.target.value))}
                  aria-valuetext={`${progress} percent complete`}
                  className="h-2 flex-1 cursor-pointer accent-brand"
                />
                <span className="w-14 shrink-0 text-right font-mono text-sm font-bold text-brand">
                  {progress}%
                </span>
              </div>
              <div className="mt-1 flex justify-between text-[10px] font-semibold text-brand-muted/70">
                {TASK_PROGRESS_STEPS.map((mark) => (
                  <span key={mark}>{mark}%</span>
                ))}
              </div>
            </div>
          ) : null}

          <p className="mt-5 rounded-[10px] bg-[#f6f3f4] px-4 py-3 text-xs text-brand-muted">
            Loading replaces the unsaved contents of Work Details. Your current Work Details stay
            as they are until you choose Load Task.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#c3c6d2]/40 p-6 pt-4">
          <DialogClose className="flex h-11 items-center justify-center rounded-[10px] border border-[#c3c6d2]/60 bg-white px-5 text-sm font-bold text-brand-navy transition-colors hover:bg-[#f6f3f4]">
            Cancel
          </DialogClose>
          {/* Closes through Base UI's own Close (like Cancel) rather than only
              flipping `open` — a prop-only close left the popup mounted and
              still hit-testable over the page. */}
          <DialogClose
            onClick={onConfirm}
            className="flex h-11 items-center justify-center gap-2 rounded-[10px] bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-[#1467d6]"
          >
            <ArrowRightCircle className="h-4 w-4" aria-hidden="true" />
            Load Task
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

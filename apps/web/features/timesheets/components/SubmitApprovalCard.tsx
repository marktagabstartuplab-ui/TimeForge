"use client";

import { useState } from "react";
import { CalendarClock, Loader2, Send, UsersRound } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, timesheetStatusTone } from "@/components/shared/StatusBadge";
import type { Timesheet } from "../api/timesheets.service";
import { useCan } from "@/features/auth/rbac";

interface SubmitApprovalCardProps {
  timesheet: Timesheet | null;
  periodEndLabel: string;
  submitting: boolean;
  savingDraft: boolean;
  error: string | null;
  onSubmit: (notes: string) => void;
  onSaveDraft: (notes: string) => void;
}

/**
 * "Submit for Approval" band (bottom of Submit Timesheet). Notes map to the
 * timesheet `summary` field.
 *
 * BACKEND GAP — the design shows the approving supervisor's name and a
 * submission deadline; neither is exposed by the API (approver is resolved
 * team-side at review time, deadlines aren't modelled), so those slots show
 * the period end and an unassigned note instead.
 */
export function SubmitApprovalCard({
  timesheet,
  periodEndLabel,
  submitting,
  savingDraft,
  error,
  onSubmit,
  onSaveDraft,
}: SubmitApprovalCardProps) {
  const [notes, setNotes] = useState("");
  const canSubmit = useCan("timesheet:submit");

  const status = timesheet?.status ?? "DRAFT";
  const locked = status !== "DRAFT" && status !== "REVISION_REQUESTED";

  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-[#f6f3f4] p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-semibold text-brand-navy">Submit for Approval</h3>
            {timesheet ? (
              <StatusBadge {...timesheetStatusTone(status)} />
            ) : null}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-brand-muted">
            I hereby certify that the hours recorded above represent a true and accurate record of
            the time spent on official duties during this pay period.
          </p>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-cyan/20 text-brand">
                <UsersRound className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs text-brand-muted">Approving Supervisor</p>
                <p className="text-sm font-semibold text-brand-ink">
                  Assigned at review — not exposed by the API yet
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-cyan/20 text-brand">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-xs text-brand-muted">Period Ends</p>
                <p className="text-sm font-semibold text-brand-ink">{periodEndLabel}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col">
          <label htmlFor="submit-notes" className="mb-1.5 text-sm font-medium text-brand-navy">
            Notes to Supervisor (Optional)
          </label>
          <Textarea
            id="submit-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={5000}
            disabled={locked}
            placeholder="Add any context for overtime or specific project adjustments..."
            className="bg-white"
          />

          {error ? (
            <p role="alert" className="mt-2 rounded-[8px] bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}
          {locked ? (
            <p role="status" className="mt-2 rounded-[8px] bg-brand-cyan/10 px-3 py-2 text-sm text-brand-navy">
              This period&apos;s timesheet is {timesheetStatusTone(status).label.toLowerCase()} — no further
              edits until it&apos;s reviewed.
            </p>
          ) : null}

          {canSubmit ? (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => onSubmit(notes)}
                disabled={submitting || locked}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[10px] bg-brand px-6 text-sm font-bold text-white transition-colors hover:bg-[#1467d6] disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="h-4 w-4" aria-hidden="true" />
                )}
                Submit Timesheet
              </button>
              <button
                type="button"
                onClick={() => onSaveDraft(notes)}
                disabled={savingDraft || locked}
                className="flex h-11 items-center justify-center rounded-[10px] bg-[#e4e2e3] px-6 text-sm font-bold text-brand-navy transition-colors hover:bg-[#d8d6d7] disabled:opacity-60"
              >
                {savingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Save Draft
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-brand-muted">
              Your role doesn&apos;t allow submitting timesheets.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

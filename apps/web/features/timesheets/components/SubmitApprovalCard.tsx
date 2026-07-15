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
  /** Supervisor's remark from the action that produced the current REJECTED status. */
  rejectionRemark?: string | null;
  rejectionBy?: string | null;
}

/** Merges the three human-input fields into the single `summary` API field. */
function buildSummary(workSummary: string, accomplishments: string, blockers: string): string {
  const parts: string[] = [];
  if (workSummary.trim()) parts.push(workSummary.trim());
  if (accomplishments.trim()) parts.push(`Accomplishments:\n${accomplishments.trim()}`);
  if (blockers.trim()) parts.push(`Challenges / Blockers:\n${blockers.trim()}`);
  return parts.join("\n\n");
}

/**
 * "Submit for Approval" band (bottom of Smart Timesheet). The employee
 * reviews auto-generated session data above, then fills in Work Summary,
 * Accomplishments, and Blockers here. All three are merged into the single
 * `summary` field that the API accepts — no backend changes required.
 *
 * BACKEND GAP — approving supervisor name and submission deadline are not
 * exposed by the API (approver is resolved team-side at review time, deadlines
 * aren't modelled), so those slots show the period end and an unassigned note.
 */
export function SubmitApprovalCard({
  timesheet,
  periodEndLabel,
  submitting,
  savingDraft,
  error,
  onSubmit,
  onSaveDraft,
  rejectionRemark,
  rejectionBy,
}: SubmitApprovalCardProps) {
  const [workSummary, setWorkSummary] = useState("");
  const [accomplishments, setAccomplishments] = useState("");
  const [blockers, setBlockers] = useState("");
  const canSubmit = useCan("timesheet:submit");

  const status = timesheet?.status ?? "DRAFT";
  // A REJECTED timesheet must be editable again so the employee can correct
  // and resubmit it (same record: Reject -> Edit -> Resubmit -> Review).
  const locked = status !== "DRAFT" && status !== "REVISION_REQUESTED" && status !== "REJECTED";

  const combinedNotes = buildSummary(workSummary, accomplishments, blockers);

  return (
    <div className="rounded-[16px] border border-[#c3c6d2]/50 bg-[#f6f3f4] p-[25px] shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left: meta info */}
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-semibold text-brand-navy">Submit for Approval</h3>
            {timesheet ? <StatusBadge {...timesheetStatusTone(status)} /> : null}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-brand-muted">
            I hereby certify that the hours recorded above represent a true and accurate record of
            the time spent on official duties during this pay period.
          </p>

          {status === "REJECTED" && rejectionRemark ? (
            <div className="mt-3 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Supervisor&apos;s Rejection Remarks{rejectionBy ? ` — ${rejectionBy}` : ""}
              </p>
              <p className="mt-1 text-sm text-red-700">{rejectionRemark}</p>
            </div>
          ) : null}

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

        {/* Right: structured human-input fields */}
        <div className="flex flex-col gap-4">
          {/* Work Summary */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ts-work-summary" className="text-sm font-medium text-brand-navy">
              Work Summary{" "}
              <span className="text-xs font-normal text-brand-muted">(required for submission)</span>
            </label>
            <Textarea
              id="ts-work-summary"
              rows={3}
              value={workSummary}
              onChange={(e) => setWorkSummary(e.target.value)}
              maxLength={2000}
              disabled={locked}
              placeholder="Briefly describe the work completed during this pay period..."
              className="bg-white"
            />
          </div>

          {/* Accomplishments */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ts-accomplishments" className="text-sm font-medium text-brand-navy">
              Accomplishments{" "}
              <span className="text-xs font-normal text-brand-muted">(optional)</span>
            </label>
            <Textarea
              id="ts-accomplishments"
              rows={2}
              value={accomplishments}
              onChange={(e) => setAccomplishments(e.target.value)}
              maxLength={2000}
              disabled={locked}
              placeholder="Key achievements or milestones this period..."
              className="bg-white"
            />
          </div>

          {/* Challenges / Blockers */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ts-blockers" className="text-sm font-medium text-brand-navy">
              Challenges / Blockers{" "}
              <span className="text-xs font-normal text-brand-muted">(optional)</span>
            </label>
            <Textarea
              id="ts-blockers"
              rows={2}
              value={blockers}
              onChange={(e) => setBlockers(e.target.value)}
              maxLength={2000}
              disabled={locked}
              placeholder="Any issues, risks, or items needing supervisor attention..."
              className="bg-white"
            />
          </div>

          {status === "REJECTED" && !locked ? (
            <p role="status" className="rounded-[8px] bg-brand-cyan/10 px-3 py-2 text-sm text-brand-navy">
              This timesheet was rejected — make your corrections above and resubmit for review.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-[8px] bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}

          {locked ? (
            <p role="status" className="rounded-[8px] bg-brand-cyan/10 px-3 py-2 text-sm text-brand-navy">
              This period&apos;s timesheet is {timesheetStatusTone(status).label.toLowerCase()} — no further
              edits until it&apos;s reviewed.
            </p>
          ) : null}

          {canSubmit ? (
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => onSubmit(combinedNotes)}
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
                onClick={() => onSaveDraft(combinedNotes)}
                // A REJECTED timesheet has no draft-save step in the API (only
                // resubmission) — correct it and use Submit Timesheet directly.
                disabled={savingDraft || locked || status === "REJECTED"}
                title={status === "REJECTED" ? "Rejected timesheets are resubmitted directly — use Submit Timesheet" : undefined}
                className="flex h-11 items-center justify-center rounded-[10px] bg-[#e4e2e3] px-6 text-sm font-bold text-brand-navy transition-colors hover:bg-[#d8d6d7] disabled:opacity-60"
              >
                {savingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Save Draft
              </button>
            </div>
          ) : (
            <p className="text-sm text-brand-muted">
              Your role doesn&apos;t allow submitting timesheets.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

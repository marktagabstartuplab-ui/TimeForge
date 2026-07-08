"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { decideTimesheet } from "../api/supervisor-dashboard.service";
import type { PendingTimesheetRow } from "../api/supervisor-dashboard.service";
import type { ToastState } from "@/components/shared/Toast";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface TimesheetReviewModalProps {
  row: PendingTimesheetRow | null;
  onOpenChange: (open: boolean) => void;
  onToast: (t: ToastState) => void;
}

/** Single-item decision (approve / reject / request revision) via the existing POST /approvals/:id/decision. */
export function TimesheetReviewModal({ row, onOpenChange, onToast }: TimesheetReviewModalProps) {
  const queryClient = useQueryClient();
  const [remark, setRemark] = useState("");

  const decide = useMutation({
    mutationFn: (action: "APPROVE" | "REJECT" | "REQUEST_REVISION") =>
      decideTimesheet(row!.id, { action, remark: remark.trim() || undefined, expectedVersion: row!.version }),
    onSuccess: (_, action) => {
      const verb = action === "APPROVE" ? "approved" : action === "REJECT" ? "rejected" : "sent back for revision";
      onToast({ message: `Timesheet ${verb}.`, tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["supervisor"] });
      setRemark("");
      onOpenChange(false);
    },
    onError: (err) => onToast({ message: err instanceof ApiError ? err.message : "Action failed.", tone: "error" }),
  });

  const needsRemark = (action: "REJECT" | "REQUEST_REVISION") => remark.trim().length === 0;

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(520px,calc(100vw-2rem))]">
        {row ? (
          <div className="flex flex-col gap-5 p-6">
            <div>
              <DialogTitle className="text-xl font-bold text-brand-navy">Review Timesheet</DialogTitle>
              <p className="mt-1 text-sm text-brand-muted">{row.employeeName} — {formatDate(row.periodStart)} to {formatDate(row.periodEnd)}</p>
            </div>

            <dl className="grid grid-cols-3 gap-4 rounded-[12px] bg-[#f6f3f4] p-4">
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Total Hours</dt>
                <dd className="mt-1 text-lg font-bold text-brand-ink">{row.totalHours}h</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">KPI Score</dt>
                <dd className="mt-1 text-lg font-bold text-brand-ink">{row.kpiScore !== null ? `${row.kpiScore}%` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Department</dt>
                <dd className="mt-1 text-lg font-bold text-brand-ink">{row.department ?? "—"}</dd>
              </div>
            </dl>

            <div>
              <label htmlFor="review-remark" className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">
                Remark (required to reject or request revision)
              </label>
              <Textarea
                id="review-remark"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Add a note for the employee…"
                className="mt-1.5"
                rows={3}
              />
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <DialogClose className="rounded-[10px] px-4 py-2 text-sm font-bold text-brand-ink hover:bg-[#f6f3f4]">
                Cancel
              </DialogClose>
              <button
                type="button"
                onClick={() => decide.mutate("REQUEST_REVISION")}
                disabled={decide.isPending || needsRemark("REQUEST_REVISION")}
                className="flex h-10 items-center gap-2 rounded-[10px] border border-amber-300 bg-amber-50 px-4 text-sm font-bold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                {decide.isPending && decide.variables === "REQUEST_REVISION" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Request Revision
              </button>
              <button
                type="button"
                onClick={() => decide.mutate("REJECT")}
                disabled={decide.isPending || needsRemark("REJECT")}
                className="flex h-10 items-center gap-2 rounded-[10px] bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {decide.isPending && decide.variables === "REJECT" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Reject
              </button>
              <button
                type="button"
                onClick={() => decide.mutate("APPROVE")}
                disabled={decide.isPending}
                className="flex h-10 items-center gap-2 rounded-[10px] bg-brand px-4 text-sm font-bold text-white hover:bg-[#1467d6] disabled:opacity-50"
              >
                {decide.isPending && decide.variables === "APPROVE" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Approve
              </button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

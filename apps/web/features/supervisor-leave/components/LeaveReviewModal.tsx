"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ApiError } from "@/lib/api/client";
import { decideLeaveRequest } from "@/features/leave/api/leave.service";
import type { LeaveRequest } from "@/features/leave/api/leave.service";
import type { ToastState } from "@/components/shared/Toast";
import { leaveStatusTone } from "./TeamLeaveTable";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: "Annual Leave",
  SICK: "Sick Leave",
  PERSONAL: "Personal Leave",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface LeaveReviewModalProps {
  request: LeaveRequest | null;
  onOpenChange: (open: boolean) => void;
  onToast: (t: ToastState) => void;
}

export function LeaveReviewModal({ request, onOpenChange, onToast }: LeaveReviewModalProps) {
  const queryClient = useQueryClient();
  const [remark, setRemark] = useState("");

  const decide = useMutation({
    mutationFn: (action: "APPROVE" | "REJECT") =>
      decideLeaveRequest(request!.id, {
        action,
        remark: remark.trim() || undefined,
        expectedVersion: request!.version,
      }),
    onSuccess: (_, action) => {
      const verb = action === "APPROVE" ? "approved" : "rejected";
      onToast({ message: `Leave request ${verb}.`, tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["supervisor", "leave"] });
      queryClient.invalidateQueries({ queryKey: ["supervisor"] });
      setRemark("");
      onOpenChange(false);
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Action failed.";
      if (message.toLowerCase().includes("version")) {
        onToast({ message: "Request was modified — please refresh and retry.", tone: "error" });
      } else {
        onToast({ message, tone: "error" });
      }
    },
  });

  return (
    <Dialog open={request !== null} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(560px,calc(100vw-2rem))]">
        {request ? (
          <div className="flex flex-col gap-5 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-xl font-bold text-brand-navy">Review Leave Request</DialogTitle>
                <p className="mt-1 text-sm text-brand-muted">
                  {request.user ? `${request.user.firstName} ${request.user.lastName}` : "Unknown employee"}
                </p>
              </div>
              <StatusBadge {...leaveStatusTone(request.status)} />
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-[12px] bg-[#f6f3f4] p-4">
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Leave Type</dt>
                <dd className="mt-0.5 font-semibold text-brand-ink">{LEAVE_TYPE_LABELS[request.type] ?? request.type}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Duration</dt>
                <dd className="mt-0.5 font-semibold text-brand-ink">{request.days} day(s)</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Start Date</dt>
                <dd className="mt-0.5 font-semibold text-brand-ink">{formatDate(request.startDate)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">End Date</dt>
                <dd className="mt-0.5 font-semibold text-brand-ink">{formatDate(request.endDate)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Submitted</dt>
                <dd className="mt-0.5 font-semibold text-brand-ink">{formatDate(request.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Attachment</dt>
                <dd className="mt-0.5 text-sm text-brand-muted">Not Available</dd>
              </div>
            </dl>

            <div>
              <dt className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Reason</dt>
              <dd className="mt-1 whitespace-pre-wrap rounded-[8px] bg-[#f6f3f4] p-3 text-sm text-brand-ink">
                {request.reason}
              </dd>
            </div>

            {request.reviewNote ? (
              <div>
                <dt className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Review Note</dt>
                <dd className="mt-1 whitespace-pre-wrap rounded-[8px] bg-[#f6f3f4] p-3 text-sm text-brand-ink">
                  {request.reviewNote}
                </dd>
              </div>
            ) : null}

            {request.status === "PENDING" ? (
              <>
                <div>
                  <label htmlFor="leave-review-remark" className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">
                    Remark (required to reject)
                  </label>
                  <Textarea
                    id="leave-review-remark"
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
                    onClick={() => decide.mutate("REJECT")}
                    disabled={decide.isPending || !remark.trim()}
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
              </>
            ) : (
              <div className="flex justify-end">
                <DialogClose className="rounded-[10px] px-4 py-2 text-sm font-bold text-brand-ink hover:bg-[#f6f3f4]">
                  Close
                </DialogClose>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

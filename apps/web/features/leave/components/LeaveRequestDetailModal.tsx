"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Paperclip } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogCloseButton } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast, type ToastState } from "@/components/shared/Toast";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/providers/auth-provider";
import { useCan } from "@/features/auth/rbac";
import {
  decideLeaveRequest,
  getLeaveAttachmentUrl,
  getLeaveRequest,
  type LeaveRequest,
} from "../api/leave.service";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: "Annual Leave",
  SICK: "Sick Leave",
  PERSONAL: "Personal Leave",
};

function statusTone(status: string): { label: string; tone: BadgeTone } {
  switch (status) {
    case "PENDING":
      return { label: "Pending", tone: "warning" };
    case "APPROVED":
      return { label: "Approved", tone: "success" };
    case "REJECTED":
      return { label: "Rejected", tone: "danger" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "neutral" };
    case "COMPLETED":
      return { label: "Returned", tone: "info" };
    default:
      return { label: status, tone: "neutral" };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold text-brand-ink">{value}</dd>
    </div>
  );
}

interface LeaveRequestDetailModalProps {
  /** Leave request id to show; `null` keeps the modal closed. */
  requestId: string | null;
  onClose: () => void;
}

/**
 * Read-only detail view of a single leave request, with inline approve/reject
 * for reviewers looking at a PENDING request. Fetches by id so it can be opened
 * from a deep link (notification "View Details") without a preloaded row.
 */
export function LeaveRequestDetailModal({ requestId, onClose }: LeaveRequestDetailModalProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canDecide = useCan("leave_request:decide");
  const [remark, setRemark] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);

  const { data: request, isLoading, isError, error } = useQuery({
    queryKey: ["leave", "request", requestId],
    queryFn: () => getLeaveRequest(requestId!),
    enabled: requestId !== null,
  });

  const decide = useMutation({
    mutationFn: (action: "APPROVE" | "REJECT") =>
      decideLeaveRequest(request!.id, {
        action,
        remark: remark.trim() || undefined,
        expectedVersion: request!.version,
      }),
    onSuccess: (_, action) => {
      setToast({ message: `Leave request ${action === "APPROVE" ? "approved" : "rejected"}.`, tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["leave"] });
      queryClient.invalidateQueries({ queryKey: ["supervisor", "leave"] });
      queryClient.invalidateQueries({ queryKey: ["supervisor", "leave-summary"] });
      queryClient.invalidateQueries({ queryKey: ["supervisor", "dashboard-leave"] });
      setRemark("");
      close();
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Action failed.";
      setToast({
        message: message.toLowerCase().includes("version")
          ? "Request was modified — please refresh and retry."
          : message,
        tone: "error",
      });
    },
  });

  function close() {
    setRemark("");
    onClose();
  }

  async function openAttachment(r: LeaveRequest) {
    try {
      const url = await getLeaveAttachmentUrl(r.id);
      window.open(url, "_blank", "noopener");
    } catch {
      setToast({ message: "Could not open the attachment.", tone: "error" });
    }
  }

  // The requester can never decide on their own request — the backend rejects it too.
  const isOwnRequest = request?.userId === user?.id;
  const showActions = Boolean(request && request.status === "PENDING" && canDecide && !isOwnRequest);

  return (
    <>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <Dialog open={requestId !== null} onOpenChange={(next) => !next && close()}>
        <DialogContent className="w-[min(600px,calc(100vw-2rem))]">
          <div className="flex items-center justify-between border-b border-[#c3c6d2]/50 px-6 py-4">
            <DialogTitle className="text-lg font-bold text-brand-navy">Leave Request Details</DialogTitle>
            <DialogCloseButton />
          </div>

          <div className="flex max-h-[70dvh] flex-col gap-5 overflow-y-auto px-6 py-5">
            {isLoading ? (
              <>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-24" />
                <Skeleton className="h-16" />
              </>
            ) : isError || !request ? (
              <p className="text-sm text-brand-muted">
                {error instanceof ApiError ? error.message : "This leave request could not be loaded."}
              </p>
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm text-brand-muted">
                    {request.user ? `${request.user.firstName} ${request.user.lastName}` : "Your request"}
                    {request.user?.department?.name ? ` · ${request.user.department.name}` : ""}
                  </p>
                  <StatusBadge {...statusTone(request.status)} />
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-[12px] bg-[#f6f3f4] p-4">
                  <Field label="Leave Type" value={LEAVE_TYPE_LABELS[request.type] ?? request.type} />
                  <Field label="Duration" value={`${request.days} day(s)`} />
                  <Field label="Start Date" value={formatDate(request.startDate)} />
                  <Field label="End Date" value={formatDate(request.endDate)} />
                  <Field label="Submitted" value={formatDate(request.createdAt)} />
                  <Field
                    label="Attachment"
                    value={
                      request.attachmentKey ? (
                        <button
                          type="button"
                          onClick={() => openAttachment(request)}
                          className="flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
                        >
                          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                          View file
                        </button>
                      ) : (
                        <span className="text-sm font-normal text-brand-muted">None</span>
                      )
                    }
                  />
                </dl>

                <div>
                  <dt className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Reason</dt>
                  <dd className="mt-1 whitespace-pre-wrap rounded-[8px] bg-[#f6f3f4] p-3 text-sm text-brand-ink">
                    {request.reason || "—"}
                  </dd>
                </div>

                {request.status !== "PENDING" && request.reviewedAt ? (
                  <div className="rounded-[12px] border border-[#c3c6d2]/50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">
                      {request.status === "APPROVED" ? "Approved by" : "Reviewed by"}
                    </p>
                    <p className="mt-0.5 font-semibold text-brand-ink">
                      {request.reviewer
                        ? `${request.reviewer.firstName} ${request.reviewer.lastName}`
                        : "—"}
                    </p>
                    <p className="mt-0.5 text-sm text-brand-muted">{formatDateTime(request.reviewedAt)}</p>
                    {request.reviewNote ? (
                      <p className="mt-2 whitespace-pre-wrap rounded-[8px] bg-[#f6f3f4] p-3 text-sm text-brand-ink">
                        {request.reviewNote}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {showActions ? (
                  <>
                    <div>
                      <label
                        htmlFor="leave-detail-remark"
                        className="text-xs font-bold uppercase tracking-[0.6px] text-brand-muted"
                      >
                        Remark (required to reject)
                      </label>
                      <Textarea
                        id="leave-detail-remark"
                        value={remark}
                        onChange={(e) => setRemark(e.target.value)}
                        placeholder="Add a note for the employee…"
                        className="mt-1.5"
                        rows={3}
                      />
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={close}
                        className="rounded-[10px] px-4 py-2 text-sm font-bold text-brand-ink hover:bg-[#f6f3f4]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => decide.mutate("REJECT")}
                        disabled={decide.isPending || !remark.trim()}
                        className="flex h-10 items-center gap-2 rounded-[10px] bg-red-600 px-4 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {decide.isPending && decide.variables === "REJECT" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => decide.mutate("APPROVE")}
                        disabled={decide.isPending}
                        className="flex h-10 items-center gap-2 rounded-[10px] bg-brand px-4 text-sm font-bold text-white hover:bg-[#1467d6] disabled:opacity-50"
                      >
                        {decide.isPending && decide.variables === "APPROVE" ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Approve
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-[10px] px-4 py-2 text-sm font-bold text-brand-ink hover:bg-[#f6f3f4]"
                    >
                      Close
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Eye } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError } from "@/lib/api/client";
import { listLeaveRequests, decideLeaveRequest } from "@/features/leave/api/leave.service";
import type { LeaveRequest, LeaveRequestQuery } from "@/features/leave/api/leave.service";
import { LeaveReviewModal } from "@/features/supervisor-leave/components/LeaveReviewModal";
import { leaveStatusTone } from "@/features/supervisor-leave/components/TeamLeaveTable";
import type { ToastState } from "@/components/shared/Toast";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: "Annual Leave",
  SICK: "Sick Leave",
  PERSONAL: "Personal Leave",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

export function PendingLeavePanel({ onToast }: { onToast: (t: ToastState) => void }) {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [reviewRequest, setReviewRequest] = useState<LeaveRequest | null>(null);

  const queryParams: LeaveRequestQuery = useMemo(
    () => ({
      scope: "team",
      status: statusFilter as LeaveRequestQuery["status"],
      limit: 50,
    }),
    [statusFilter],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["supervisor", "dashboard-leave", statusFilter],
    queryFn: () => listLeaveRequests(queryParams),
    refetchInterval: 30_000,
  });

  const rows = data?.data ?? [];

  const quickDecide = useMutation({
    mutationFn: ({ id, version, action }: { id: string; version: number; action: "APPROVE" | "REJECT" }) =>
      decideLeaveRequest(id, { action, expectedVersion: version }),
    onSuccess: (_, vars) => {
      const verb = vars.action === "APPROVE" ? "approved" : "rejected";
      onToast({ message: `Leave request ${verb}.`, tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["supervisor"] });
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
    <>
      <SectionCard
        title="Review Pending Leave Requests"
        action={
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? "PENDING")}>
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-brand-muted" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            variant="empty"
            message={
              statusFilter === "PENDING"
                ? "No leave requests awaiting your review."
                : `No ${statusFilter.toLowerCase()} leave requests found.`
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-brand-muted">
                  <th className="pb-2 pr-3">Employee</th>
                  <th className="pb-2 pr-3">Department</th>
                  <th className="pb-2 pr-3">Leave Type</th>
                  <th className="pb-2 pr-3">Date Range</th>
                  <th className="pb-2 pr-3">Duration</th>
                  <th className="pb-2 pr-3">Submitted</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c3c6d2]/30">
                {rows.map((r) => {
                  const { label, tone } = leaveStatusTone(r.status);
                  return (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-brand-ink">
                          {r.user ? `${r.user.firstName} ${r.user.lastName}` : "—"}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-brand-muted">
                        <span className="text-xs">{r.user?.department?.name ?? "—"}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-brand-ink">{LEAVE_TYPE_LABELS[r.type] ?? r.type}</td>
                      <td className="py-2.5 pr-3 whitespace-nowrap text-brand-muted">
                        {formatDate(r.startDate)} – {formatDate(r.endDate)}
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-brand-ink">{r.days} day(s)</td>
                      <td className="py-2.5 pr-3 text-brand-muted">{formatDate(r.createdAt)}</td>
                      <td className="py-2.5 pr-3"><StatusBadge label={label} tone={tone} /></td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setReviewRequest(r)}
                            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-brand-muted hover:bg-[#f6f3f4] hover:text-brand"
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {r.status === "PENDING" ? (
                            <>
                              <button
                                type="button"
                                onClick={() => quickDecide.mutate({ id: r.id, version: r.version, action: "APPROVE" })}
                                disabled={quickDecide.isPending}
                                className="rounded-[8px] bg-brand px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#1467d6] disabled:opacity-50"
                              >
                                {quickDecide.isPending && quickDecide.variables?.id === r.id && quickDecide.variables?.action === "APPROVE" ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  "Approve"
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => quickDecide.mutate({ id: r.id, version: r.version, action: "REJECT" })}
                                disabled={quickDecide.isPending}
                                className="rounded-[8px] border border-red-200 px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                {quickDecide.isPending && quickDecide.variables?.id === r.id && quickDecide.variables?.action === "REJECT" ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  "Reject"
                                )}
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <LeaveReviewModal
        request={reviewRequest}
        onOpenChange={(open) => !open && setReviewRequest(null)}
        onToast={onToast}
      />
    </>
  );
}

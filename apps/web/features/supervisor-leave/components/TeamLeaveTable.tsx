"use client";

import { useMemo } from "react";
import { Loader2 } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Avatar } from "@/components/shared/Avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { LeaveRequest } from "@/features/leave/api/leave.service";

export function leaveStatusTone(status: string): { label: string; tone: BadgeTone } {
  switch (status) {
    case "PENDING":
      return { label: "Pending", tone: "warning" };
    case "APPROVED":
      return { label: "Approved", tone: "success" };
    case "REJECTED":
      return { label: "Rejected", tone: "danger" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "neutral" };
    default:
      return { label: status, tone: "neutral" };
  }
}

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: "Annual Leave",
  SICK: "Sick Leave",
  PERSONAL: "Personal Leave",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface TeamLeaveTableProps {
  rows: LeaveRequest[];
  isLoading: boolean;
  onReview: (row: LeaveRequest) => void;
  filtersActive: boolean;
  onClearFilters: () => void;
}

export function TeamLeaveTable({ rows, isLoading, onReview, filtersActive, onClearFilters }: TeamLeaveTableProps) {
  const pendingCount = useMemo(() => rows.filter((r) => r.status === "PENDING").length, [rows]);

  const columns: DataTableColumn<LeaveRequest>[] = useMemo(
    () => [
      {
        key: "employee",
        header: "Employee",
        className: "w-52",
        render: (r) =>
          r.user ? (
            <div className="flex items-center gap-2.5">
              <Avatar firstName={r.user.firstName} lastName={r.user.lastName} size="sm" />
              <div>
                <div className="font-medium text-brand-ink">{r.user.firstName} {r.user.lastName}</div>
              </div>
            </div>
          ) : (
            <span className="text-brand-muted">—</span>
          ),
      },
      {
        key: "type",
        header: "Leave Type",
        render: (r) => <span className="text-brand-ink">{LEAVE_TYPE_LABELS[r.type] ?? r.type}</span>,
      },
      {
        key: "dates",
        header: "Dates",
        render: (r) => (
          <span className="whitespace-nowrap text-brand-ink">
            {formatDate(r.startDate)} – {formatDate(r.endDate)}
          </span>
        ),
      },
      {
        key: "duration",
        header: "Duration",
        render: (r) => <span className="text-brand-ink">{r.days} day(s)</span>,
      },
      {
        key: "status",
        header: "Status",
        render: (r) => {
          const { label, tone } = leaveStatusTone(r.status);
          return <StatusBadge label={label} tone={tone} />;
        },
      },
      {
        key: "approver",
        header: "Approver",
        render: (r) =>
          r.reviewer ? (
            <span className="text-brand-ink">{r.reviewer.firstName} {r.reviewer.lastName}</span>
          ) : (
            <span className="text-brand-muted">—</span>
          ),
      },
    ],
    [],
  );

  if (isLoading) {
    return (
      <SectionCard title="Leave Requests" action={null}>
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Leave Requests"
      action={
        pendingCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-600">
            <Loader2 className="h-3 w-3" />
            {pendingCount} pending
          </span>
        ) : null
      }
    >
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={onReview}
        emptyState={
          filtersActive ? (
            <EmptyState
              variant="empty"
              message="No matching leave requests."
              action={
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="mt-2 rounded-[8px] bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-[#1467d6]"
                >
                  Clear Filters
                </button>
              }
            />
          ) : (
            <EmptyState variant="empty" message="No leave requests found for your team." />
          )
        }
      />
      {rows.length > 0 ? (
        <div className="border-t border-[#c3c6d2]/30 px-4 py-2">
          <p className="text-xs text-brand-muted">
            Click any row to review the request.
          </p>
        </div>
      ) : null}
    </SectionCard>
  );
}

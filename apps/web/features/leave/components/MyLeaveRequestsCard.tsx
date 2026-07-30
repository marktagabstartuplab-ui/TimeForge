"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PalmtreeIcon } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { listLeaveRequests, type LeaveRequest } from "../api/leave.service";
import { leaveRequestStatusTone } from "./LeaveRequestDetailModal";

const LEAVE_TYPE_LABELS: Record<string, string> = {
  ANNUAL: "Annual",
  SICK: "Sick",
  PERSONAL: "Personal",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatRange(r: LeaveRequest): string {
  const start = formatDate(r.startDate);
  return r.startDate === r.endDate ? start : `${start} – ${formatDate(r.endDate)}`;
}

/**
 * The employee's own leave requests and where each one stands. Until this
 * existed there was no employee-facing view of a submitted request at all, so
 * leave notifications had nowhere meaningful to land.
 *
 * Clicking a row sets ?leaveRequest=<id> rather than opening a modal locally —
 * AppShell's deep-link handler owns the single detail modal instance, so the
 * row click and a notification link go through exactly the same path, and the
 * open request stays in the URL.
 */
export function MyLeaveRequestsCard() {
  const router = useRouter();
  const pathname = usePathname();

  const { data, isLoading } = useQuery({
    queryKey: ["leave", "my-requests"],
    queryFn: () => listLeaveRequests({ scope: "self", limit: 10 }),
  });

  const rows = data?.data ?? [];

  const columns: DataTableColumn<LeaveRequest>[] = useMemo(
    () => [
      {
        key: "type",
        header: "Type",
        render: (r) => (
          <span className="font-semibold text-brand-navy">{LEAVE_TYPE_LABELS[r.type] ?? r.type}</span>
        ),
      },
      { key: "dates", header: "Dates", render: (r) => <span className="text-brand-muted">{formatRange(r)}</span> },
      {
        key: "days",
        header: "Days",
        className: "w-20",
        render: (r) => <span className="text-brand-muted">{r.days}</span>,
      },
      {
        key: "status",
        header: "Status",
        className: "w-32",
        render: (r) => <StatusBadge {...leaveRequestStatusTone(r.status)} />,
      },
    ],
    [],
  );

  function openRequest(r: LeaveRequest) {
    // Read the query string here rather than via useSearchParams: the hook
    // would force a Suspense boundary around this card at prerender, and a
    // click handler only ever runs client-side anyway.
    const next = new URLSearchParams(window.location.search);
    next.set("leaveRequest", r.id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <SectionCard
      title="My Leave Requests"
      action={<PalmtreeIcon className="h-5 w-5 text-brand-muted" aria-hidden="true" />}
    >
      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : (
        <>
          {rows.length > 0 ? (
            <p className="mb-2 text-xs text-brand-muted">
              Click a request to see its full details and the approver&apos;s decision.
            </p>
          ) : null}
          <DataTable
            aria-label="My leave requests"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={openRequest}
            emptyState={
              <EmptyState message="You haven't submitted any leave requests yet — they'll appear here with their status once you do." />
            }
          />
        </>
      )}
    </SectionCard>
  );
}

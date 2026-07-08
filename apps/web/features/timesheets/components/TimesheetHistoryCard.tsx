"use client";

import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusBadge, timesheetStatusTone } from "@/components/shared/StatusBadge";
import { listTimesheets, type Timesheet } from "../api/timesheets.service";
import { formatPeriodRange, minutesToHours } from "@/lib/time";

const columns: DataTableColumn<Timesheet>[] = [
  {
    key: "period",
    header: "Pay Period",
    render: (t) => (
      <span className="font-semibold">
        {formatPeriodRange(new Date(t.periodStart), new Date(t.periodEnd))}
      </span>
    ),
  },
  {
    key: "hours",
    header: "Hours",
    render: (t) => `${minutesToHours(t.totalMinutes).toFixed(1)} hrs`,
  },
  {
    key: "status",
    header: "Status",
    render: (t) => <StatusBadge {...timesheetStatusTone(t.status)} />,
  },
  {
    key: "summary",
    header: "Notes",
    className: "max-w-[320px]",
    render: (t) => <span className="line-clamp-2 text-brand-muted">{t.summary || "—"}</span>,
  },
];

/**
 * Past pay periods and their approval states (Employee Timesheet History).
 * REVISION_REQUESTED periods are called out — those re-open the submit flow.
 */
export function TimesheetHistoryCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["timesheets", "history"],
    queryFn: () => listTimesheets({ limit: 12 }),
  });

  const sheets = [...(data?.data ?? [])].sort((a, b) => b.periodStart.localeCompare(a.periodStart));
  const needsRevision = sheets.some((t) => t.status === "REVISION_REQUESTED");

  return (
    <SectionCard title="Timesheet History">
      {needsRevision ? (
        <p
          role="status"
          className="-mt-2 rounded-[8px] bg-amber-50 px-3 py-2 text-sm text-amber-700"
        >
          A supervisor requested revisions on one of your timesheets — update your entries and
          resubmit from the current-period panel above.
        </p>
      ) : null}
      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : isError ? (
        <EmptyState message="Could not load your timesheet history." />
      ) : (
        <DataTable
          aria-label="Timesheet history"
          columns={columns}
          rows={sheets}
          rowKey={(t) => t.id}
          emptyState={<EmptyState message="No timesheets yet — your submitted periods will appear here." />}
        />
      )}
    </SectionCard>
  );
}

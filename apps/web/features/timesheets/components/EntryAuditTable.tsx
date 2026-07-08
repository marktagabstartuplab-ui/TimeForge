"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { listProjects, listWorkCategories } from "@/features/time-tracking/api/catalog.service";
import type { TimeEntry } from "@/features/time-tracking/api/time-entries.service";
import { formatClockTime, formatMinutesClock, minutesBetween, toIsoDate } from "@/lib/time";

const COLLAPSED_ROWS = 6;

interface EntryAuditTableProps {
  entries: TimeEntry[];
  /** Days whose totals exceed 8h (rows get an Overtime badge). */
  overtimeDays: Set<string>;
  periodDayCount: number;
}

/** "Timesheet Entry Audit" table (Submit Timesheet, Figma 127:2792). */
export function EntryAuditTable({ entries, overtimeDays, periodDayCount }: EntryAuditTableProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: projects } = useQuery({ queryKey: ["catalog", "projects"], queryFn: listProjects });
  const { data: categories } = useQuery({
    queryKey: ["catalog", "work-categories"],
    queryFn: listWorkCategories,
  });

  const visible = expanded ? entries : entries.slice(0, COLLAPSED_ROWS);

  const columns: DataTableColumn<TimeEntry>[] = [
    {
      key: "project",
      header: "Project / Task",
      render: (e) => (
        <div>
          <p className="font-semibold text-brand">
            {(e.projectId && projects?.find((p) => p.id === e.projectId)?.name) || "No project"}
          </p>
          <p className="text-xs text-brand-muted">
            {(e.workCategoryId && categories?.find((c) => c.id === e.workCategoryId)?.name) || "General work"}
          </p>
        </div>
      ),
    },
    {
      key: "range",
      header: "Start/End",
      render: (e) => (
        <span className="whitespace-nowrap text-brand-muted">
          {formatClockTime(e.startTime)}
          {" → "}
          {e.endTime ? formatClockTime(e.endTime) : "running"}
        </span>
      ),
    },
    {
      key: "duration",
      header: "Duration",
      render: (e) => (
        <StatusBadge
          label={formatMinutesClock(
            e.durationMinutes ?? minutesBetween(e.startTime, e.endTime ?? new Date().toISOString()),
          )}
          tone="info"
        />
      ),
    },
    {
      key: "description",
      header: "Description",
      className: "max-w-[320px]",
      render: (e) => <span className="line-clamp-2 text-brand-ink">{e.description || "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      className: "text-right",
      render: (e) => {
        if (overtimeDays.has(toIsoDate(new Date(e.startTime)))) {
          return <StatusBadge label="Overtime" tone="info" className="bg-brand-cyan/25 text-brand" />;
        }
        return e.timesheetId ? (
          <StatusBadge label="Verified" tone="success" />
        ) : (
          <StatusBadge label="Unassigned" tone="neutral" />
        );
      },
    },
  ];

  return (
    <div className="flex flex-col rounded-[16px] border border-[#c3c6d2]/50 bg-white shadow-[0px_1px_1px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between px-[25px] pt-[25px] pb-4">
        <h3 className="text-xl text-brand-navy">Timesheet Entry Audit</h3>
      </div>
      <div className="px-[25px] pb-2">
        <DataTable
          aria-label="Timesheet entries for the current period"
          columns={columns}
          rows={visible}
          rowKey={(e) => e.id}
          emptyState={
            <EmptyState message="No time entries in this pay period yet — log time from the Daily Scrum page." />
          }
        />
      </div>
      {entries.length > COLLAPSED_ROWS ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-b-[16px] border-t border-[#c3c6d2]/40 bg-[#faf9f9] py-3 text-sm font-bold text-brand hover:bg-[#f6f3f4]"
        >
          {expanded
            ? "Show fewer entries"
            : `View all ${entries.length} entries (${periodDayCount} days in period)`}
        </button>
      ) : (
        <div className="pb-4" />
      )}
    </div>
  );
}

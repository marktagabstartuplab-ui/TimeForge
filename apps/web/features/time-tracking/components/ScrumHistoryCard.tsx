"use client";

import { useQuery } from "@tanstack/react-query";
import { History, Lock } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { listScrumEntries, type ScrumEntry, type ScrumTaskStatus } from "@/features/scrum/api/scrum.service";
import { toIsoDate } from "@/lib/time";

const DAY_STATUS_META: Record<ScrumTaskStatus, { label: string; tone: BadgeTone }> = {
  NOT_STARTED: { label: "Not Started", tone: "neutral" },
  IN_PROGRESS: { label: "In Progress", tone: "info" },
  BLOCKED: { label: "Blocked", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "info" },
};

function formatEntryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

const columns: DataTableColumn<ScrumEntry>[] = [
  {
    key: "date",
    header: "Date",
    render: (e) => <span className="font-semibold text-brand-navy">{formatEntryDate(e.entryDate)}</span>,
  },
  {
    key: "today",
    header: "Today's Commitments",
    className: "max-w-[320px]",
    render: (e) => <span className="line-clamp-2 text-brand-muted">{e.today || "—"}</span>,
  },
  {
    key: "blockers",
    header: "Blockers",
    className: "max-w-[220px]",
    render: (e) => <span className="line-clamp-2 text-brand-muted">{e.blockers || "—"}</span>,
  },
  {
    key: "status",
    header: "Status",
    render: (e) => (
      <div className="flex items-center gap-1.5">
        <StatusBadge {...DAY_STATUS_META[e.status]} />
        {e.isLocked ? <Lock className="h-3.5 w-3.5 text-brand-muted" aria-label="Locked" /> : null}
      </div>
    ),
  },
  {
    key: "supervisorNote",
    header: "Supervisor Comment",
    className: "max-w-[240px]",
    render: (e) => (
      <span className="line-clamp-2 text-brand-muted">{e.supervisorNote || "—"}</span>
    ),
  },
];

/**
 * Read-only history of the employee's own previously submitted Daily Scrum
 * entries. Reuses the existing GET /scrum-entries API (already own-user-scoped
 * server-side for non-supervisor callers) — no new endpoint.
 */
export function ScrumHistoryCard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["scrum-entries", "history"],
    queryFn: () => listScrumEntries({ limit: 30 }),
  });

  const today = toIsoDate(new Date());
  const entries = [...(data?.data ?? [])]
    .filter((e) => toIsoDate(new Date(e.entryDate)) !== today)
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate));

  return (
    <SectionCard
      title="Daily Scrum History"
      action={<History className="h-5 w-5 text-brand-muted" aria-hidden="true" />}
    >
      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : isError ? (
        <EmptyState message="Could not load your scrum history." action={<button type="button" onClick={() => refetch()} className="text-sm font-semibold text-brand hover:underline">Retry</button>} />
      ) : (
        <DataTable
          aria-label="Daily Scrum history"
          columns={columns}
          rows={entries}
          rowKey={(e) => e.id}
          emptyState={<EmptyState message="No previous submissions yet — your past Daily Scrum entries will appear here." />}
        />
      )}
    </SectionCard>
  );
}

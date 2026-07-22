"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { History, Lock, MessageSquare } from "lucide-react";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { StatusBadge, type BadgeTone } from "@/components/shared/StatusBadge";
import { Dialog, DialogContent, DialogTitle, DialogCloseButton } from "@/components/ui/dialog";
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
  // Today/Blockers/Supervisor Comment are clamped to 2 lines in the table
  // (long entries were unreadable, no way to see the rest) — clicking a row
  // opens the full text here instead.
  const [selected, setSelected] = useState<ScrumEntry | null>(null);

  const today = toIsoDate(new Date());
  const entries = [...(data?.data ?? [])]
    .filter((e) => toIsoDate(new Date(e.entryDate)) !== today)
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate));

  // Deep-link support: if ?scrum=<id> is in the URL, auto-open that entry's
  // detail modal so "View that scrum" takes the employee straight to the record.
  const searchParams = useSearchParams();
  const deepLinkId = searchParams.get("scrum");
  useEffect(() => {
    if (!deepLinkId || entries.length === 0) return;
    const match = entries.find((e) => e.id === deepLinkId);
    if (match) setSelected(match);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkId, entries.length]);

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
        <>
          {entries.length > 0 ? (
            <p className="mb-2 text-xs text-brand-muted">Click a row to read the full entry and comment.</p>
          ) : null}
          <DataTable
            aria-label="Daily Scrum history"
            columns={columns}
            rows={entries}
            rowKey={(e) => e.id}
            onRowClick={(e) => setSelected(e)}
            emptyState={<EmptyState message="No previous submissions yet — your past Daily Scrum entries will appear here." />}
          />
        </>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(next) => !next && setSelected(null)}>
        <DialogContent className="w-[min(600px,calc(100vw-2rem))]">
          <div className="flex items-center justify-between border-b border-[#c3c6d2]/50 px-6 py-4">
            <DialogTitle>{selected ? formatEntryDate(selected.entryDate) : ""}</DialogTitle>
            <DialogCloseButton />
          </div>
          {selected ? (
            <div className="flex max-h-[70dvh] flex-col gap-4 overflow-y-auto px-6 py-5">
              <div className="flex items-center gap-2">
                <StatusBadge {...DAY_STATUS_META[selected.status]} />
                {selected.isLocked ? (
                  <span className="flex items-center gap-1 text-xs text-brand-muted">
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Locked
                  </span>
                ) : null}
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Today&apos;s Commitments</p>
                <p className="whitespace-pre-wrap text-sm text-brand-ink">{selected.today || "—"}</p>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.6px] text-brand-muted">Blockers</p>
                <p className="whitespace-pre-wrap text-sm text-brand-ink">{selected.blockers || "—"}</p>
              </div>
              {selected.supervisorNote ? (
                <div className="rounded-[12px] border border-brand/20 bg-brand-cyan/5 p-4">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.6px] text-brand">
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Supervisor Comment
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-brand-ink">{selected.supervisorNote}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

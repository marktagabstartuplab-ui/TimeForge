"use client";

import { useQuery } from "@tanstack/react-query";
import { Briefcase, FileText, Link2, Paperclip } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { getTimesheetDetail } from "../api/timesheets.service";

function formatEntryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Read-only view of a timesheet's entries with the employee's saved Work
 * Details (task, project/client, description, deliverables, links,
 * attachments). Reused by the HR timesheet review modal and Finance's payroll
 * drill-down so the work details recorded during the Daily Scrum flow travel
 * with the timesheet through the whole approval pipeline — same data the
 * supervisor approved, via the existing GET /timesheets/:id (org-read RBAC
 * enforced server-side; no new endpoints).
 */
export function TimesheetWorkDetails({ timesheetId }: { timesheetId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["timesheets", "detail", timesheetId],
    queryFn: () => getTimesheetDetail(timesheetId),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (isError || !data) {
    return <EmptyState message="Could not load the work details for this timesheet." />;
  }

  const entries = data.entries ?? [];
  if (entries.length === 0) {
    return <EmptyState message="No time entries are attached to this timesheet." />;
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((entry) => {
        const context = [entry.project?.name, entry.client?.name, entry.department?.name]
          .filter(Boolean)
          .join(" · ");
        const links = entry.referenceLinks ?? [];
        const attachments = entry.attachments ?? [];
        const hasRejection = entry.rejectedMinutes != null && entry.rejectedMinutes > 0;
        const submittedMins = entry.submittedMinutes ?? ((entry.durationMinutes ?? 0) + (entry.rejectedMinutes ?? 0));

        return (
          <div key={entry.id} className="rounded-[12px] border border-[#c3c6d2]/40 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Briefcase className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <p className="truncate text-sm font-semibold text-brand-navy">
                  {entry.task?.trim() || "General work"}
                </p>
                {hasRejection && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                    {formatDuration(entry.rejectedMinutes)} Rejected
                  </span>
                )}
              </div>
              <p className="shrink-0 text-xs text-brand-muted">
                {formatEntryDate(entry.startTime)} · {formatTime(entry.startTime)}
                {entry.endTime ? ` – ${formatTime(entry.endTime)}` : " (running)"} ·{" "}
                <span className="font-semibold text-brand-ink">{formatDuration(entry.durationMinutes)}</span>
              </p>
            </div>

            {hasRejection && (
              <div className="mt-2.5 rounded-[8px] bg-red-50/60 border border-red-200/80 p-2.5 text-xs text-red-900">
                <p className="font-semibold">
                  Hours Split: {formatDuration(entry.durationMinutes)} Approved · {formatDuration(entry.rejectedMinutes)} Rejected (Submitted: {formatDuration(submittedMins)})
                </p>
                {entry.rejectionReason && (
                  <p className="mt-1 text-red-800">
                    <span className="font-semibold text-red-900">Reason: </span>
                    {entry.rejectionReason}
                  </p>
                )}
              </div>
            )}

            {context ? <p className="mt-1 text-xs text-brand-muted">{context}</p> : null}

            {entry.description ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-brand-ink">{entry.description}</p>
            ) : null}

            {entry.deliverables ? (
              <div className="mt-2 flex items-start gap-1.5 rounded-[8px] bg-[#f6f3f4] px-3 py-2">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-muted" aria-hidden="true" />
                <p className="whitespace-pre-wrap text-xs text-brand-ink">
                  <span className="font-semibold text-brand-muted">Deliverables: </span>
                  {entry.deliverables}
                </p>
              </div>
            ) : null}

            {links.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link2 className="h-3.5 w-3.5 text-brand-muted" aria-hidden="true" />
                {links.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="max-w-[260px] truncate text-xs font-medium text-brand hover:underline"
                  >
                    {url}
                  </a>
                ))}
              </div>
            ) : null}

            {attachments.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 text-brand-muted" aria-hidden="true" />
                {attachments.map((a) => (
                  <span key={a.key} className="rounded-full bg-brand-cyan/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                    {a.filename}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

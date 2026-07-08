"use client";

import { useQuery } from "@tanstack/react-query";
import { SectionCard } from "@/components/shared/SectionCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { listAuditLogs } from "@/features/admin/api/audit-logs.service";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function actionLabel(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function entityLabel(entityType: string | null): string {
  if (!entityType) return "";
  return entityType
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Compact recent-activity feed scoped to employee/role administration events. */
export function AuditTimelineCard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["employee-management", "audit-timeline"],
    queryFn: () => listAuditLogs({ limit: 8 }),
  });

  const rows = data?.data ?? [];

  return (
    <SectionCard title="Audit Log" className="lg:w-[360px] lg:shrink-0">
      <p className="-mt-2 text-xs text-brand-muted">Recent administrative activities.</p>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : isError ? (
        <ErrorState message="Couldn't load recent activity." onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState message="No recent administrative activity." />
      ) : (
        <ul className="flex flex-col divide-y divide-[#c3c6d2]/40">
          {rows.map((log) => (
            <li key={log.id} className="flex flex-col gap-0.5 border-l-2 border-brand/30 py-2 pl-3">
              <span className="text-sm font-semibold text-brand-navy">
                {actionLabel(log.action)}{log.entityType ? `: ${entityLabel(log.entityType)}` : ""}
              </span>
              <span className="text-xs text-brand-muted">{formatDateTime(log.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
